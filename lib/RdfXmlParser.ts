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

  // TODO: make unit tests + rerun spec stuff
  public valueToUri(value: string, activeTag: IActiveTag): RDF.NamedNode {
    let baseIRI: string = activeTag.baseIRI || '';
    const baseFragmentPos: number = baseIRI.indexOf('#');

    // Ignore any fragments in the base IRI
    if (baseFragmentPos > 0) {
      baseIRI = baseIRI.substr(0, baseFragmentPos);
    }

    // Convert empty value directly to base IRI
    if (!value.length) {
      return this.dataFactory.namedNode(baseIRI);
    }

    // If the value starts with a hash, concat directly
    if (value.startsWith('#')) {
      return this.dataFactory.namedNode(baseIRI + value);
    }

    // Ignore baseIRI if it is empty
    if (!baseIRI.length) {
      return this.dataFactory.namedNode(value);
    }

    // Ignore baseIRI if the value is absolute
    const valueColonPos: number = value.indexOf(':');
    if (valueColonPos >= 0) {
      return this.dataFactory.namedNode(value);
    }

    // At this point, the baseIRI MUST be absolute, otherwise we error
    const baseColonPos: number = baseIRI.indexOf(':');
    if (baseColonPos < 0) {
      throw new Error(`Found invalid baseIRI '${baseIRI}' for value '${value}'`);
    }

    const baseIRIScheme = baseIRI.substr(0, baseColonPos + 1);
    // Inherit the baseIRI scheme if the value starts with '//'
    if (value.indexOf('//') === 0) {
      return this.dataFactory.namedNode(baseIRIScheme + value);
    }

    // Check cases where '://' occurs in the baseIRI, and where there is no '/' after a ':' anymore.
    let baseSlashAfterColonPos;
    if (baseIRI.indexOf('//', baseColonPos) === baseColonPos + 1) {
      // If there is no additional '/' after the '//'.
      baseSlashAfterColonPos = baseIRI.indexOf('/', baseColonPos + 3);
      if (baseSlashAfterColonPos < 0) {
        // If something other than a '/' follows the '://', append the value after a '/',
        // otherwise, prefix the value with only the baseIRI scheme.
        if (baseIRI.length > baseColonPos + 3) {
          return this.dataFactory.namedNode(baseIRI + '/' + value);
        } else {
          return this.dataFactory.namedNode(baseIRIScheme + value);
        }
      }
    } else {
      // If there is not even a single '/' after the ':'
      baseSlashAfterColonPos = baseIRI.indexOf('/', baseColonPos + 1);
      if (baseSlashAfterColonPos < 0) {
        // If something other than a '/' follows the ':', append the value after a '/',
        // otherwise, prefix the value with only the baseIRI scheme.
        // TODO: these cases are equal? collapse?
        if (baseIRI.length > baseColonPos + 1) {
          return this.dataFactory.namedNode(baseIRI + '/' + value);
        } else {
          return this.dataFactory.namedNode(baseIRIScheme + value);
        }
      }
    }

    // If the value starts with a '/', then prefix it with everything before the first effective slash of the base IRI.
    if (value.indexOf('/') === 0) {
      return this.dataFactory.namedNode(baseIRI.substr(0, baseSlashAfterColonPos) + value);
    }

    let baseIRIPath = baseIRI.substr(baseSlashAfterColonPos);
    const baseIRILastSlashPos = baseIRIPath.lastIndexOf('/');

    // Ignore everything after the last '/' in the baseIRI path
    if (baseIRILastSlashPos >= 0 && baseIRILastSlashPos < baseIRIPath.length - 1) {
      baseIRIPath = baseIRIPath.substr(0, baseIRILastSlashPos + 1);
    }

    // Prefix the value with the baseIRI path where
    value = baseIRIPath + value;
    // Remove all occurrences of '*/../' to collapse paths to parents
    while (value.match(/[^\/]*\/\.\.\//)) {
      value = value.replace(/[^\/]*\/\.\.\//, '');
    }
    // Remove all occurrences of './'
    value = value.replace(/\.\//g, '');
    // Remove suffix '/.'
    value = value.replace(/\/\.$/, '/');

    // Prefix our transformed value with the part of the baseIRI until the first '/' after the first ':'.
    return this.dataFactory.namedNode(baseIRI.substr(0, baseSlashAfterColonPos) + value);
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
        const tagName: string = tag.prefix ? `${tag.prefix}:${tag.local}` : tag.local;
        let attributes: string = '';
        for (const attributeKey in tag.attributes) {
          attributes += ` ${attributeKey}="${tag.attributes[attributeKey].value}"`;
        }
        const tagContents: string = `${tagName}${attributes}`;
        const tagString: string = `<${tagContents}>`;
        parentTag.childrenStringTags.push(tagString);

        // Inherit the array, so that deeper tags are appended to this same array
        const stringActiveTag: IActiveTag = { childrenStringTags: parentTag.childrenStringTags };
        stringActiveTag.childrenStringEmitClosingTag = `</${tagName}>`;
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
        const objects: string[] = [];

        // Collect all attributes as triples
        // Assign subject value only after all attributes have been processed, because baseIRI may change the final val
        let activeSubjectValue: string = null;
        let claimSubjectNodeId: boolean = false;
        let subjectValueBlank: boolean = false;
        for (const attributeKey in tag.attributes) {
          const attributeValue: QualifiedAttribute = tag.attributes[attributeKey];
          if (parentTag && attributeValue.uri === RdfXmlParser.RDF) {
            switch (attributeValue.local) {
            case 'about':
              if (activeSubjectValue) {
                this.emit('error', new Error(`Only one of rdf:about, rdf:nodeID and rdf:ID can be present, \
while ${attributeValue.value} and ${activeSubjectValue} where found.`));
              }
              activeSubjectValue = attributeValue.value;
              continue;
            case 'ID':
              if (activeSubjectValue) {
                this.emit('error', new Error(`Only one of rdf:about, rdf:nodeID and rdf:ID can be present, \
while ${attributeValue.value} and ${activeSubjectValue} where found.`));
              }
              activeSubjectValue = '#' + attributeValue.value;
              claimSubjectNodeId = true;
              continue;
            case 'nodeID':
              if (activeSubjectValue) {
                this.emit('error', new Error(`Only one of rdf:about, rdf:nodeID and rdf:ID can be present, \
while ${attributeValue.value} and ${activeSubjectValue} where found.`));
              }
              activeSubjectValue = attributeValue.value;
              subjectValueBlank = true;
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

          // Interpret attributes at this point as properties on this node,
          // but we ignore attributes that have no prefix or known expanded URI
          if (attributeValue.prefix !== 'xml' && attributeValue.uri) {
            predicates.push(this.dataFactory.namedNode(attributeValue.uri + attributeValue.local));
            objects.push(attributeValue.value);
          }
        }

        // Create the subject value _after_ all attributes have been processed
        if (activeSubjectValue !== null) {
          activeTag.subject = subjectValueBlank
            ? this.dataFactory.blankNode(activeSubjectValue) : this.valueToUri(activeSubjectValue, activeTag);
          if (claimSubjectNodeId) {
            this.claimNodeId(activeTag.subject);
          }
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
            } else { // !parentTag.predicateEmitted
              // Set-based properties
              this.emitTriple(parentTag.subject, parentTag.predicate, activeTag.subject, parentTag.reifiedStatementId);

              // Emit pending properties on the parent tag that had no defined subject yet.
              for (let i = 0; i < parentTag.predicateSubPredicates.length; i++) {
                this.emitTriple(activeTag.subject, parentTag.predicateSubPredicates[i],
                  parentTag.predicateSubObjects[i], null);
              }

              // Cleanup so we don't emit them again when the parent tag is closed
              parentTag.predicateSubPredicates = [];
              parentTag.predicateSubObjects = [];
              parentTag.predicateEmitted = true;
            }
          }

          // Emit all collected triples
          for (let i = 0; i < predicates.length; i++) {
            const object: RDF.Term = this.dataFactory.literal(objects[i],
              activeTag.datatype || activeTag.language);
            this.emitTriple(activeTag.subject, predicates[i], object, parentTag.reifiedStatementId);
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
        activeTag.predicateSubPredicates = [];
        activeTag.predicateSubObjects = [];
        let parseTypeResource: boolean = false;
        let attributedProperty: boolean = false;

        // Collect all attributes as triples
        // Assign subject value only after all attributes have been processed, because baseIRI may change the final val
        let activeSubSubjectValue: string = null;
        let claimSubSubjectNodeId: boolean = false;
        let subSubjectValueBlank: boolean = true;
        const predicates: RDF.Term[] = [];
        const objects: RDF.Term[] = [];
        for (const propertyAttributeKey in tag.attributes) {
          const propertyAttributeValue: QualifiedAttribute = tag.attributes[propertyAttributeKey];
          if (propertyAttributeValue.uri === RdfXmlParser.RDF) {
            switch (propertyAttributeValue.local) {
            case 'resource':
              if (activeSubSubjectValue) {
                this.emit('error', new Error(`Found both rdf:resource (${propertyAttributeValue.value
                  }) and rdf:nodeID (${activeSubSubjectValue}).`));
              }
              if (parseTypeResource) {
                this.emit('error',
                  new Error(`rdf:parseType="Resource" is not allowed on property elements with rdf:resource (${
                    propertyAttributeValue.value})`));
              }
              activeTag.hadChildren = true;
              activeSubSubjectValue = propertyAttributeValue.value;
              subSubjectValueBlank = false;
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
              activeSubSubjectValue = propertyAttributeValue.value;
              claimSubSubjectNodeId = true;
              subSubjectValueBlank = true;
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
                if (activeTag.datatype) {
                  this.emit('error',
                    new Error(`rdf:parseType="Resource" is not allowed on property elements with rdf:datatype (${
                      activeTag.datatype.value})`));
                }
                if (activeSubSubjectValue) {
                  this.emit('error', new Error(
                    `rdf:parseType="Resource" is not allowed on property elements with rdf:nodeID or rdf:resource (${
                      activeSubSubjectValue})`));
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
                subSubjectValueBlank = false;
              } else if (propertyAttributeValue.value === 'Literal') {
                // Interpret children as being part of a literal string
                activeTag.childrenTagsToString = true;
                activeTag.childrenStringTags = [];
              }
              continue;
            case 'ID':
              activeTag.reifiedStatementId = this.valueToUri('#' + propertyAttributeValue.value, activeTag);
              this.claimNodeId(activeTag.reifiedStatementId);
              continue;
            }
          } else if (propertyAttributeValue.uri === RdfXmlParser.XML && propertyAttributeValue.local === 'lang') {
            activeTag.language = propertyAttributeValue.value === ''
              ? null : propertyAttributeValue.value.toLowerCase();
            continue;
          }

          // Interpret attributes at this point as properties via implicit blank nodes on the property,
          // but we ignore attributes that have no prefix or known expanded URI
          if (propertyAttributeValue.prefix !== 'xml' && propertyAttributeValue.uri) {
            if (parseTypeResource || activeTag.datatype) {
              this.emit('error', new Error(
                `Found illegal rdf:* properties on property element with attribute: ${propertyAttributeValue.value}`));
            }
            activeTag.hadChildren = true;
            attributedProperty = true;
            predicates.push(this.dataFactory.namedNode(propertyAttributeValue.uri + propertyAttributeValue.local));
            objects.push(this.dataFactory.literal(propertyAttributeValue.value,
              activeTag.datatype || activeTag.language));
          }
        }

        // Create the subject value _after_ all attributes have been processed
        if (activeSubSubjectValue !== null) {
          const subjectParent: RDF.Term = activeTag.subject;
          activeTag.subject = subSubjectValueBlank
            ? this.dataFactory.blankNode(activeSubSubjectValue) : this.valueToUri(activeSubSubjectValue, activeTag);
          if (claimSubSubjectNodeId) {
            this.claimNodeId(activeTag.subject);
          }
          this.emitTriple(subjectParent, activeTag.predicate, activeTag.subject, activeTag.reifiedStatementId);

          // Emit our buffered triples
          for (let i = 0; i < predicates.length; i++) {
            this.emitTriple(activeTag.subject, predicates[i], objects[i], null);
          }
          activeTag.predicateEmitted = true;
        } else if (subSubjectValueBlank) {
          // The current property element has no defined subject
          // Let's buffer the properties until the child node defines a subject,
          // or if the tag closes.
          activeTag.predicateSubPredicates = predicates;
          activeTag.predicateSubObjects = objects;
          activeTag.predicateEmitted = false;
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

      if (poppedTag.childrenCollectionSubject) {
        // Terminate the rdf:List
        this.emitTriple(poppedTag.childrenCollectionSubject, poppedTag.childrenCollectionPredicate,
          this.dataFactory.namedNode(RdfXmlParser.RDF + 'nil'), poppedTag.reifiedStatementId);
      } else if (poppedTag.predicate) {
        if (!poppedTag.hadChildren && poppedTag.text) {
          // Property element contains text
          this.emitTriple(poppedTag.subject, poppedTag.predicate,
            this.dataFactory.literal(poppedTag.text, poppedTag.datatype || poppedTag.language),
            poppedTag.reifiedStatementId);
        } else if (!poppedTag.predicateEmitted) {
          // Emit remaining properties on an anonymous property element
          const subject: RDF.Term = this.dataFactory.blankNode();
          this.emitTriple(poppedTag.subject, poppedTag.predicate, subject, poppedTag.reifiedStatementId);
          for (let i = 0; i < poppedTag.predicateSubPredicates.length; i++) {
            this.emitTriple(subject, poppedTag.predicateSubPredicates[i], poppedTag.predicateSubObjects[i], null);
          }
        }
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
  predicateEmitted?: boolean;
  predicateSubPredicates?: RDF.Term[];
  predicateSubObjects?: RDF.Term[];
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
