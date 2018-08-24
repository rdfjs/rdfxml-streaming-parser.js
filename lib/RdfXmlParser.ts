import * as RDF from "rdf-js";
import {createStream, QualifiedAttribute, QualifiedTag, SAXStream} from "sax";
import {Transform, TransformCallback} from "stream";

export class RdfXmlParser extends Transform {

  public static readonly RDF = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#';
  public static readonly RDF_ABOUT = RdfXmlParser.RDF + 'about';
  public static readonly RDF_RESOURCE = RdfXmlParser.RDF + 'resource';

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
      const activeTag: IActiveTag = {};
      this.activeTagStack.push(activeTag);

      if (tag.uri === RdfXmlParser.RDF) {
        switch (tag.local) {
        case 'RDF':
          // Ignore further processing with root <rdf:RDF> tag.
          return;
        case 'Description':
          // rdf:Description defines a term
          const predicates: RDF.Term[] = [];
          const objects: RDF.Term[] = [];

          // Collect all attributes as triples
          for (const attributeKey in tag.attributes) {
            const attributeValue: QualifiedAttribute = tag.attributes[attributeKey];
            if (attributeValue.uri === RdfXmlParser.RDF) {
              switch (attributeValue.local) {
              case 'about':
                activeTag.subject = this.dataFactory.namedNode(attributeValue.value);
                continue;
              }
            }

            predicates.push(this.dataFactory.namedNode(attributeValue.uri + attributeValue.local));
            objects.push(this.dataFactory.literal(attributeValue.value));
          }

          // This subject won't be used anywhere, avoid further computation
          if (!parentTag.predicate && !predicates.length) {
            return;
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

      // Interpret tags at this point as predicates
      activeTag.subject = parentTag.subject; // Inherit parent subject
      activeTag.predicate = this.dataFactory.namedNode(tag.uri + tag.local);
    });

    this.saxStream.on('closetag', (tagName: string) => {
      this.activeTagStack.pop();
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
}
