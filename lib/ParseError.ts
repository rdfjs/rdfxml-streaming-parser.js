import type { SaxesParser } from '@rubensworks/saxes';
import type { RdfXmlParser } from './RdfXmlParser';

/**
 * An error that includes line and column in the error message.
 */
export class ParseError extends Error {
  public constructor(parser: RdfXmlParser, message: string) {
    const saxParser: SaxesParser = (<{ saxParser: SaxesParser }><unknown>parser).saxParser;
    super(parser.trackPosition ? `Line ${saxParser.line} column ${saxParser.column + 1}: ${message}` : message);
  }
}
