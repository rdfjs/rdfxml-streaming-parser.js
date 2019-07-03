import {SAXParser} from "sax";
import {RdfXmlParser} from "./RdfXmlParser";

/**
 * An error that includes line and column in the error message.
 */
export class ParseError extends Error {

  constructor(parser: RdfXmlParser, message: string) {
    const saxParser: SAXParser = (<any> (<any> parser).saxStream)._parser;
    super(parser.trackPosition ? `Line ${saxParser.line} column ${saxParser.column}: ${message}` : message);
  }

}
