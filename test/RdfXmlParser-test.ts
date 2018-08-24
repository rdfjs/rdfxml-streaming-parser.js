import {SAXStream} from "sax";
import {RdfXmlParser} from "../lib/RdfXmlParser";

describe('RdfXmlParser', () => {
  it('should be constructable without args', () => {
    const instance = new RdfXmlParser();
    expect(instance).toBeInstanceOf(RdfXmlParser);
    expect((<any> instance).dataFactory).toBe(require('@rdfjs/data-model'));
    expect((<any> instance).baseIRI).toBe('');
    expect((<any> instance).saxStream).toBeInstanceOf(SAXStream);
  });

  it('should be constructable with empty args', () => {
    const instance = new RdfXmlParser({});
    expect(instance).toBeInstanceOf(RdfXmlParser);
    expect((<any> instance).dataFactory).toBe(require('@rdfjs/data-model'));
    expect((<any> instance).baseIRI).toBe('');
    expect((<any> instance).saxStream).toBeInstanceOf(SAXStream);
  });

  it('should be constructable with args with a custom data factory', () => {
    const instance = new RdfXmlParser({ dataFactory: <any> 'abc' });
    expect(instance).toBeInstanceOf(RdfXmlParser);
    expect((<any> instance).dataFactory).toEqual('abc');
    expect((<any> instance).baseIRI).toBe('');
    expect((<any> instance).saxStream).toBeInstanceOf(SAXStream);
  });

  it('should be constructable with args with a custom base IRI', () => {
    const instance = new RdfXmlParser({ baseIRI: 'myBaseIRI' });
    expect(instance).toBeInstanceOf(RdfXmlParser);
    expect((<any> instance).dataFactory).toBe(require('@rdfjs/data-model'));
    expect((<any> instance).baseIRI).toEqual('myBaseIRI');
    expect((<any> instance).saxStream).toBeInstanceOf(SAXStream);
  });

  it('should be constructable with args with a custom data factory and base IRI', () => {
    const instance = new RdfXmlParser({ dataFactory: <any> 'abc', baseIRI: 'myBaseIRI' });
    expect(instance).toBeInstanceOf(RdfXmlParser);
    expect((<any> instance).dataFactory).toEqual('abc');
    expect((<any> instance).baseIRI).toEqual('myBaseIRI');
    expect((<any> instance).saxStream).toBeInstanceOf(SAXStream);
  });

  describe('#expandPrefixedTerm', () => {
    it('should not expand strings without colon', () => {
      expect(RdfXmlParser.expandPrefixedTerm('abc', {})).toEqual('abc');
    });

    it('should not expand strings with unknown colon', () => {
      expect(RdfXmlParser.expandPrefixedTerm('a:abc', {})).toEqual('a:abc');
    });

    it('should expand strings with known colon', () => {
      expect(RdfXmlParser.expandPrefixedTerm('a:abc', { a: 'xyz#' })).toEqual('xyz#abc');
    });
  });
});
