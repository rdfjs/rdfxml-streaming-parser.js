import * as RDF from "rdf-js";
import {createStream, QualifiedAttribute, QualifiedTag, SAXStream} from "sax";
import {Transform, TransformCallback} from "stream";

export class RdfXmlParser extends Transform {

  public static readonly RDF = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#';
  public static readonly XML = 'http://www.w3.org/XML/1998/namespace';

  private readonly dataFactory: RDF.DataFactory;
  private readonly baseIRI: string;
  private readonly saxStream: SAXStream;

  private readonly activeTagStack: IActiveTag[] = [];

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

    this.saxStream = createStream(true, { xmlns: true });
    this.attachSaxListeners();
  }

  public static expandPrefixedTerm(term: string, ns: { [key: string]: string }): string {
    const colonIndex: number = term.indexOf(':');
    if (colonIndex >= 0) {
      const prefix: string = term.substr(0, colonIndex);
      const suffix: string = term.substr(colonIndex + 1);
      const expandedPrefix: string = ns[prefix];
      if (!expandedPrefix) {
        return term;
      }
      return expandedPrefix + suffix;
    } else {
      return term;
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
      if (parentTag) {
        parentTag.hadChildren = true;
      }

      const activeTag: IActiveTag = {};
      if (parentTag) {
        // Inherit language scope from parent
        activeTag.language = parentTag.language;
      }
      this.activeTagStack.push(activeTag);

      if (tag.uri === RdfXmlParser.RDF) {
        switch (tag.local) {
        case 'RDF':
          // Ignore further processing with root <rdf:RDF> tag.
          return;
        case 'Description':
          // rdf:Description defines a node element
          const predicates: RDF.Term[] = [];
          const objects: RDF.Term[] = [];

          // Collect all attributes as triples
          for (const attributeKey in tag.attributes) {
            const attributeValue: QualifiedAttribute = tag.attributes[attributeKey];
            if (attributeValue.uri === RdfXmlParser.RDF) {
              switch (attributeValue.local) {
              case 'about':
                if (activeTag.subject) {
                  this.emit('error', new Error(
                    `Found both rdf:about (${attributeValue.value}) and rdf:nodeID (${activeTag.subject.value}).`));
                }
                activeTag.subject = this.dataFactory.namedNode(attributeValue.value);
                continue;
              case 'nodeID':
                if (activeTag.subject) {
                  this.emit('error', new Error(
                    `Found both rdf:about (${activeTag.subject.value}) and rdf:nodeID (${attributeValue.value}).`));
                }
                activeTag.subject = this.dataFactory.blankNode(attributeValue.value);
                continue;
              }
            } else if (attributeValue.uri === RdfXmlParser.XML && attributeValue.local === 'lang') {
              activeTag.language = attributeValue.value === '' ? null : attributeValue.value.toLowerCase();
              continue;
            }

            predicates.push(this.dataFactory.namedNode(attributeValue.uri + attributeValue.local));
            objects.push(this.dataFactory.literal(attributeValue.value));
          }

          // Force the creation of a subject if it doesn't exist yet
          if (!activeTag.subject) {
            activeTag.subject = this.dataFactory.blankNode();
          }

          // If the parent tag defined a predicate, add the current tag as property value
          if (parentTag.predicate) {
            this.push(this.dataFactory.triple(parentTag.subject, parentTag.predicate, activeTag.subject));
          }

          // Emit all collected triples
          for (let i = 0; i < predicates.length; i++) {
            this.push(this.dataFactory.triple(activeTag.subject, predicates[i], objects[i]));
          }

          return;
        }
      }

      // Interpret tags at this point as property elements
      activeTag.subject = parentTag.subject; // Inherit parent subject
      activeTag.predicate = this.dataFactory.namedNode(tag.uri + tag.local);
      for (const propertyAttributeKey in tag.attributes) {
        const propertyAttributeValue: QualifiedAttribute = tag.attributes[propertyAttributeKey];
        if (propertyAttributeValue.uri === RdfXmlParser.RDF) {
          switch (propertyAttributeValue.local) {
          case 'resource':
            if (activeTag.nodeId) {
              this.emit('error', new Error(`Found both rdf:resource (${propertyAttributeValue.value
              }) and rdf:nodeID (${activeTag.nodeId.value}).`));
            }
            activeTag.hadChildren = true;
            this.push(this.dataFactory.triple(activeTag.subject, activeTag.predicate,
                this.dataFactory.namedNode(propertyAttributeValue.value)));
            break;
          case 'datatype':
            activeTag.datatype = this.dataFactory.namedNode(propertyAttributeValue.value);
            break;
          case 'nodeID':
            if (activeTag.hadChildren) {
              this.emit('error', new Error(
                `Found both rdf:resource and rdf:nodeID (${propertyAttributeValue.value}).`));
            }
            activeTag.nodeId = this.dataFactory.blankNode(propertyAttributeValue.value);
            break;
          }
        } else if (propertyAttributeValue.uri === RdfXmlParser.XML && propertyAttributeValue.local === 'lang') {
          activeTag.language = propertyAttributeValue.value === '' ? null : propertyAttributeValue.value.toLowerCase();
        }
      }
    });

    this.saxStream.on('text', (text: string) => {
      const activeTag: IActiveTag = this.activeTagStack.length
        ? this.activeTagStack[this.activeTagStack.length - 1] : null;

      if (activeTag && activeTag.predicate) {
        activeTag.text = text;
      }
    });

    this.saxStream.on('closetag', (tagName: string) => {
      const poppedTag: IActiveTag = this.activeTagStack.pop();
      if (poppedTag && !poppedTag.hadChildren && poppedTag.predicate) {
        if (poppedTag.text) {
          // Property element contains text
          this.push(this.dataFactory.triple(poppedTag.subject, poppedTag.predicate,
            this.dataFactory.literal(poppedTag.text, poppedTag.datatype || poppedTag.language)));
        } else {
          // Property element is a blank node
          this.push(this.dataFactory.triple(poppedTag.subject, poppedTag.predicate,
            poppedTag.nodeId || this.dataFactory.blankNode()));
        }
      }
    });
  }
}

export interface IRdfXmlParserArgs {
  dataFactory?: RDF.DataFactory;
  baseIRI?: string;
}

export interface IActiveTag {
  subject?: RDF.Term;
  predicate?: RDF.Term;
  hadChildren?: boolean;
  text?: string;
  language?: string;
  datatype?: RDF.NamedNode;
  nodeId?: RDF.BlankNode;
}
