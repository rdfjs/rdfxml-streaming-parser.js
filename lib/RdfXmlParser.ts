import * as RDF from "rdf-js";
import {createStream, QualifiedAttribute, QualifiedTag, SAXStream} from "sax";
import {Transform, TransformCallback} from "stream";

export class RdfXmlParser extends Transform {

  public static readonly MIME_TYPE = 'application/rdf+xml';

  public static readonly RDF = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#';
  public static readonly XML = 'http://www.w3.org/XML/1998/namespace';

  private readonly dataFactory: RDF.DataFactory;
  private readonly baseIRI: string;
  private readonly defaultGraph?: RDF.Term;
  private readonly strict?: boolean;
  private readonly saxStream: SAXStream;

  private readonly activeTagStack: IActiveTag[] = [];
  private readonly nodeIds: {[id: string]: boolean} = {};

  constructor(args?: IRdfXmlParserArgs) {
    super({ objectMode: true });

    if (args) {
      Object.assign(this, args);
    }
    if (!this.dataFactory) {
      this.dataFactory = require('@rdfjs/data-model');
    }
    if (!this.baseIRI) {
      this.baseIRI = '';
    }
    if (!this.defaultGraph) {
      this.defaultGraph = this.dataFactory.defaultGraph();
    }

    this.saxStream = createStream(this.strict, { xmlns: true });

    // Workaround for an issue in SAX where non-strict mode either lower- or upper-cases all tags.
    if (!this.strict) {
      (<any> this.saxStream)._parser.looseCase = 'toString';
    }

    this.attachSaxListeners();
  }

  public valueToUri(value: string, activeTag: IActiveTag): RDF.NamedNode {
    return this.dataFactory.namedNode(!activeTag.baseIRI || value.indexOf('://') > 0
      ? value : activeTag.baseIRI + value);
  }

  public emitTriple(subject: RDF.Term, predicate: RDF.Term, object: RDF.Term, statementId?: RDF.Term) {
    this.push(this.dataFactory.quad(subject, predicate, object, this.defaultGraph));

    // Reify triple
    if (statementId) {
      this.push(this.dataFactory.quad(statementId,
        this.dataFactory.namedNode(RdfXmlParser.RDF + 'type'),
        this.dataFactory.namedNode(RdfXmlParser.RDF + 'Statement'),
        this.defaultGraph));
      this.push(this.dataFactory.quad(statementId,
        this.dataFactory.namedNode(RdfXmlParser.RDF + 'subject'), subject, this.defaultGraph));
      this.push(this.dataFactory.quad(statementId,
        this.dataFactory.namedNode(RdfXmlParser.RDF + 'predicate'), predicate, this.defaultGraph));
      this.push(this.dataFactory.quad(statementId,
        this.dataFactory.namedNode(RdfXmlParser.RDF + 'object'), object, this.defaultGraph));
    }
  }

  public _transform(chunk: any, encoding: string, callback: TransformCallback) {
    this.saxStream.write(chunk, encoding);
    callback();
  }

  protected attachSaxListeners() {
    // Forward errors
    this.saxStream.on('error', (error) => this.emit('error', error));

    this.saxStream.on('opentag', (tag: QualifiedTag) => {
      // Get parent tag
      const parentTag: IActiveTag = this.activeTagStack.length
        ? this.activeTagStack[this.activeTagStack.length - 1] : null;
      let currentParseType = ParseType.RESOURCE;
      if (parentTag) {
        parentTag.hadChildren = true;
        currentParseType = parentTag.childrenParseType;
      }

      // Check if this tag needs to be converted to a string
      if (parentTag && parentTag.childrenStringTags) {
        // Convert this tag to a string
        const tagName: string = `${tag.prefix}:${tag.local}`;
        let attributes: string = '';
        for (const attributeKey in tag.attributes) {
          attributes += ` ${attributeKey}="${tag.attributes[attributeKey].value}"`;
        }
        const tagContents: string = `${tagName}${attributes}`;
        const tagString: string = tag.isSelfClosing ? `<${tagContents} />` : `<${tagContents}>`;
        parentTag.childrenStringTags.push(tagString);

        // Inherit the array, so that deeper tags are appended to this same array
        const stringActiveTag: IActiveTag = { childrenStringTags: parentTag.childrenStringTags };
        if (!tag.isSelfClosing) {
          stringActiveTag.childrenStringEmitClosingTag = `</${tagName}>`;
        }
        this.activeTagStack.push(stringActiveTag);

        // Halt any further processing
        return;
      }

      const activeTag: IActiveTag = {};
      if (parentTag) {
        // Inherit language scope and baseIRI from parent
        activeTag.language = parentTag.language;
        activeTag.baseIRI = parentTag.baseIRI;
      } else {
        activeTag.baseIRI = this.baseIRI;
      }
      this.activeTagStack.push(activeTag);
      if (currentParseType === ParseType.RESOURCE) {
        activeTag.childrenParseType = ParseType.PROPERTY;
        // Assume that the current node is a _typed_ node (2.13), unless we find an rdf:Description as node name
        let typedNode: boolean = true;
        if (tag.uri === RdfXmlParser.RDF) {
          switch (tag.local) {
          case 'RDF':
            // Tags under <rdf:RDF> must always be resources
            activeTag.childrenParseType = ParseType.RESOURCE;
          case 'Description':
            typedNode = false;
          }
        }

        const predicates: RDF.Term[] = [];
        const objects: RDF.Term[] = [];

        // Collect all attributes as triples
        for (const attributeKey in tag.attributes) {
          const attributeValue: QualifiedAttribute = tag.attributes[attributeKey];
          if (parentTag && attributeValue.uri === RdfXmlParser.RDF) {
            switch (attributeValue.local) {
            case 'about':
              if (activeTag.subject) {
                this.emit('error', new Error(`Only one of rdf:about, rdf:nodeID and rdf:ID can be present, \
while ${attributeValue.value} and ${activeTag.subject.value} where found.`));
              }
              activeTag.subject = this.valueToUri(attributeValue.value, activeTag);
              continue;
            case 'ID':
              if (activeTag.subject) {
                this.emit('error', new Error(`Only one of rdf:about, rdf:nodeID and rdf:ID can be present, \
while ${attributeValue.value} and ${activeTag.subject.value} where found.`));
              }
              activeTag.subject = this.valueToUri('#' + attributeValue.value, activeTag);
              this.claimNodeId(activeTag.subject);
              continue;
            case 'nodeID':
              if (activeTag.subject) {
                this.emit('error', new Error(`Only one of rdf:about, rdf:nodeID and rdf:ID can be present, \
while ${attributeValue.value} and ${activeTag.subject.value} where found.`));
              }
              activeTag.subject = this.dataFactory.blankNode(attributeValue.value);
              continue;
            }
          } else if (attributeValue.uri === RdfXmlParser.XML) {
            if (attributeValue.local === 'lang') {
              activeTag.language = attributeValue.value === '' ? null : attributeValue.value.toLowerCase();
              continue;
            } else if (attributeValue.local === 'base') {
              activeTag.baseIRI = attributeValue.value;
              continue;
            }
          }

          predicates.push(this.dataFactory.namedNode(attributeValue.uri + attributeValue.local));
          objects.push(this.dataFactory.literal(attributeValue.value));
        }

        // Skip further handling on root tag
        if (parentTag) {
          // Force the creation of a subject if it doesn't exist yet
          if (!activeTag.subject) {
            activeTag.subject = this.dataFactory.blankNode();
          }

          // Emit the type if we're at a typed node
          if (typedNode) {
            const type: RDF.NamedNode = this.dataFactory.namedNode(tag.uri + tag.local);
            this.emitTriple(activeTag.subject, this.dataFactory.namedNode(RdfXmlParser.RDF + 'type'),
              type, parentTag.reifiedStatementId);
          }

          // If the parent tag defined a predicate, add the current tag as property value
          if (parentTag.predicate) {
            if (parentTag.childrenCollectionSubject) {
              // RDF:List-based properties
              const linkTerm: RDF.BlankNode = this.dataFactory.blankNode();

              // Emit <x> <p> <current-chain> OR <previous-chain> <rdf:rest> <current-chain>
              this.emitTriple(parentTag.childrenCollectionSubject,
                parentTag.childrenCollectionPredicate, linkTerm, parentTag.reifiedStatementId);

              // Emit <current-chain> <rdf:first> value
              this.emitTriple(linkTerm, this.dataFactory.namedNode(RdfXmlParser.RDF + 'first'),
                activeTag.subject, activeTag.reifiedStatementId);

              // Store <current-chain> in the parent node
              parentTag.childrenCollectionSubject = linkTerm;
              parentTag.childrenCollectionPredicate = this.dataFactory.namedNode(RdfXmlParser.RDF + 'rest');
            } else {
              // Set-based properties
              this.emitTriple(parentTag.subject, parentTag.predicate, activeTag.subject, parentTag.reifiedStatementId);
            }
          }

          // Emit all collected triples
          for (let i = 0; i < predicates.length; i++) {
            this.emitTriple(activeTag.subject, predicates[i], objects[i], parentTag.reifiedStatementId);
          }
        }
      } else { // currentParseType === ParseType.PROPERTY
        activeTag.childrenParseType = ParseType.RESOURCE;
        activeTag.subject = parentTag.subject; // Inherit parent subject
        if (tag.uri === RdfXmlParser.RDF && tag.local === 'li') {
          // Convert rdf:li to rdf:_x
          if (!parentTag.listItemCounter) {
            parentTag.listItemCounter = 1;
          }
          activeTag.predicate = this.dataFactory.namedNode(tag.uri + '_' + parentTag.listItemCounter++);
        } else {
          activeTag.predicate = this.dataFactory.namedNode(tag.uri + tag.local);
        }
        let parseTypeResource: boolean = false;
        let attributedProperty: boolean = false;
        for (const propertyAttributeKey in tag.attributes) {
          const propertyAttributeValue: QualifiedAttribute = tag.attributes[propertyAttributeKey];
          if (propertyAttributeValue.uri === RdfXmlParser.RDF) {
            switch (propertyAttributeValue.local) {
            case 'resource':
              if (attributedProperty) {
                this.emit('error', new Error(
                  `Found both non-rdf:* property attributes and rdf:resource (${propertyAttributeValue.value}).`));
              }
              if (activeTag.nodeId) {
                this.emit('error', new Error(`Found both rdf:resource (${propertyAttributeValue.value
                  }) and rdf:nodeID (${activeTag.nodeId.value}).`));
              }
              if (parseTypeResource) {
                this.emit('error',
                  new Error(`rdf:parseType="Resource" is not allowed on property elements with rdf:resource (${
                    propertyAttributeValue.value})`));
              }
              activeTag.hadChildren = true;
              this.emitTriple(activeTag.subject, activeTag.predicate,
                this.valueToUri(propertyAttributeValue.value, activeTag), activeTag.reifiedStatementId);
              continue;
            case 'datatype':
              if (attributedProperty) {
                this.emit('error', new Error(
                  `Found both non-rdf:* property attributes and rdf:datatype (${propertyAttributeValue.value}).`));
              }
              if (parseTypeResource) {
                this.emit('error',
                  new Error(`rdf:parseType="Resource" is not allowed on property elements with rdf:datatype (${
                    propertyAttributeValue.value})`));
              }
              activeTag.datatype = this.valueToUri(propertyAttributeValue.value, activeTag);
              continue;
            case 'nodeID':
              if (attributedProperty) {
                this.emit('error', new Error(
                  `Found both non-rdf:* property attributes and rdf:nodeID (${propertyAttributeValue.value}).`));
              }
              if (activeTag.hadChildren) {
                this.emit('error', new Error(
                  `Found both rdf:resource and rdf:nodeID (${propertyAttributeValue.value}).`));
              }
              if (parseTypeResource) {
                this.emit('error',
                  new Error(`rdf:parseType="Resource" is not allowed on property elements with rdf:nodeID (${
                    propertyAttributeValue.value})`));
              }
              activeTag.nodeId = this.dataFactory.blankNode(propertyAttributeValue.value);
              continue;
            case 'parseType':
              if (propertyAttributeValue.value === 'Resource') {
                parseTypeResource = true;
                activeTag.childrenParseType = ParseType.PROPERTY;

                // Validation
                if (attributedProperty) {
                  this.emit('error', new Error(
                    `rdf:parseType="Resource" is not allowed when non-rdf:* property attributes are present`));
                }
                if (activeTag.hadChildren) {
                  this.emit('error',
                    new Error(`rdf:parseType="Resource" is not allowed on property elements with rdf:resource`));
                }
                if (activeTag.datatype) {
                  this.emit('error',
                    new Error(`rdf:parseType="Resource" is not allowed on property elements with rdf:datatype (${
                      activeTag.datatype.value})`));
                }
                if (activeTag.nodeId) {
                  this.emit('error',
                    new Error(`rdf:parseType="Resource" is not allowed on property elements with rdf:nodeID (${
                      activeTag.nodeId.value})`));
                }

                // Turn this property element into a node element
                const nestedBNode: RDF.BlankNode = this.dataFactory.blankNode();
                this.emitTriple(activeTag.subject, activeTag.predicate, nestedBNode, activeTag.reifiedStatementId);
                activeTag.subject = nestedBNode;
                activeTag.predicate = null;
              } else if (propertyAttributeValue.value === 'Collection') {
                // Interpret children as being part of an rdf:List
                activeTag.hadChildren = true;
                activeTag.childrenCollectionSubject = activeTag.subject;
                activeTag.childrenCollectionPredicate = activeTag.predicate;
              } else if (propertyAttributeValue.value === 'Literal') {
                // Interpret children as being part of a literal string
                activeTag.childrenTagsToString = true;
                activeTag.childrenStringTags = [];
              }
              continue;
            case 'ID':
              if (activeTag.hadChildren) {
                this.emit('error', new Error(`rdf:ID is not allowed on property elements with rdf:resource`));
              }
              activeTag.reifiedStatementId = this.valueToUri('#' + propertyAttributeValue.value, activeTag);
              this.claimNodeId(activeTag.reifiedStatementId);
              continue;
            }
          } else if (propertyAttributeValue.uri === RdfXmlParser.XML && propertyAttributeValue.local === 'lang') {
            activeTag.language = propertyAttributeValue.value === ''
              ? null : propertyAttributeValue.value.toLowerCase();
            continue;
          }

          // Interpret attributes at this point as properties via implicit blank nodes on the property
          if (parseTypeResource || activeTag.hadChildren || activeTag.datatype || activeTag.nodeId
          || activeTag.reifiedStatementId) {
            this.emit('error', new Error(
              `Found illegal rdf:* properties on property element with attribute: ${propertyAttributeValue.value}`));
          }
          activeTag.hadChildren = true;
          attributedProperty = true;
          const implicitPropertyBNode: RDF.BlankNode = this.dataFactory.blankNode();
          this.emitTriple(activeTag.subject, activeTag.predicate, implicitPropertyBNode, activeTag.reifiedStatementId);
          this.emitTriple(
            implicitPropertyBNode,
            this.dataFactory.namedNode(propertyAttributeValue.uri + propertyAttributeValue.local),
            this.dataFactory.literal(propertyAttributeValue.value,
              activeTag.datatype || activeTag.language),
            activeTag.reifiedStatementId,
          );
        }
      }
    });

    this.saxStream.on('text', (text: string) => {
      const activeTag: IActiveTag = this.activeTagStack.length
        ? this.activeTagStack[this.activeTagStack.length - 1] : null;

      if (activeTag) {
        if (activeTag.childrenStringTags) {
          activeTag.childrenStringTags.push(text);
        } else if (activeTag.predicate) {
          activeTag.text = text;
        }
      }
    });

    this.saxStream.on('closetag', (tagName: string) => {
      const poppedTag: IActiveTag = this.activeTagStack.pop();

      // If we were converting a tag to a string, and the tag was not self-closing, close it here.
      if (poppedTag.childrenStringEmitClosingTag) {
        poppedTag.childrenStringTags.push(poppedTag.childrenStringEmitClosingTag);
      }

      // Set the literal value if we were collecting XML tags to string
      if (poppedTag.childrenTagsToString) {
        poppedTag.datatype = this.dataFactory.namedNode(RdfXmlParser.RDF + 'XMLLiteral');
        poppedTag.text = poppedTag.childrenStringTags.join('');
        poppedTag.hadChildren = false; // Force a literal triple to be emitted hereafter
      }

      if (!poppedTag.hadChildren && poppedTag.predicate) {
        if (poppedTag.text) {
          // Property element contains text
          this.emitTriple(poppedTag.subject, poppedTag.predicate,
            this.dataFactory.literal(poppedTag.text, poppedTag.datatype || poppedTag.language),
            poppedTag.reifiedStatementId);
        } else {
          // Property element is a blank node
          this.emitTriple(poppedTag.subject, poppedTag.predicate,
            poppedTag.nodeId || this.dataFactory.blankNode(), poppedTag.reifiedStatementId);
        }
      } else if (poppedTag.childrenCollectionSubject) {
        // Terminate the rdf:List
        this.emitTriple(poppedTag.childrenCollectionSubject, poppedTag.childrenCollectionPredicate,
          this.dataFactory.namedNode(RdfXmlParser.RDF + 'nil'), poppedTag.reifiedStatementId);
      }
    });

    // Fetch local DOCTYPE ENTITY's and make the parser recognise them.
    this.saxStream.on('doctype', (doctype: string) => {
      doctype.replace(/<!ENTITY ([^ ]+) "([^"]+)">/g, (match, prefix, uri) => {
        (<any> this.saxStream)._parser.ENTITIES[prefix] = uri;
        return '';
      });
    });
  }

  /**
   * Register the given term as a node ID.
   * If one was already registered, this will emit an error.
   *
   * This is used to check duplicate occurrences of rdf:ID in scope of the baseIRI.
   * @param {Term} term An RDF term.
   */
  protected claimNodeId(term: RDF.Term) {
    if (this.nodeIds[term.value]) {
      this.emit('error', new Error(`Found multiple occurrences of rdf:ID='${term.value}'.`));
    }
    this.nodeIds[term.value] = true;
  }
}

export interface IRdfXmlParserArgs {
  dataFactory?: RDF.DataFactory;
  baseIRI?: string;
  defaultGraph?: RDF.Term;
  strict?: boolean;
}

export interface IActiveTag {
  subject?: RDF.Term;
  predicate?: RDF.Term;
  hadChildren?: boolean;
  text?: string;
  language?: string;
  datatype?: RDF.NamedNode;
  nodeId?: RDF.BlankNode;
  childrenParseType?: ParseType;
  baseIRI?: string;
  listItemCounter?: number;
  reifiedStatementId?: RDF.Term;
  childrenTagsToString?: boolean;
  childrenStringTags?: string[];
  childrenStringEmitClosingTag?: string;
  // for creating rdf:Lists
  childrenCollectionSubject?: RDF.Term;
  childrenCollectionPredicate?: RDF.Term;
}

export enum ParseType {
  RESOURCE,
  PROPERTY,
}
