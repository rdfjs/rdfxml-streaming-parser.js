import * as RDF from "rdf-js";
import {createStream, QualifiedTag, SAXStream} from "sax";
import {Transform, TransformCallback} from "stream";

export class RdfXmlParser extends Transform {

  public static readonly RDF = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#';
  public static readonly RDF_RDF = RdfXmlParser.RDF + 'RDF';

  private readonly dataFactory: RDF.DataFactory;
  private readonly baseIRI: string;
  private readonly saxStream: SAXStream;

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
      const expandedIri = RdfXmlParser.expandPrefixedTerm(tag.name, tag.ns);
      if (expandedIri === RdfXmlParser.RDF_RDF) {
        // Ignore further processing with root <rdf:RDF> tag.
        return;
      }
    });

    this.saxStream.on('closetag', (tagName: string) => {
      // TODO
    });
  }
}

export interface IRdfXmlParserArgs {
  dataFactory?: RDF.DataFactory;
  baseIRI?: string;
}
