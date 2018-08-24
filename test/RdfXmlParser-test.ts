import "jest-rdf";
import * as RDF from "rdf-js";
import {SAXStream} from "sax";
import {RdfXmlParser} from "../lib/RdfXmlParser";
const streamifyString = require('streamify-string');
const arrayifyStream = require('arrayify-stream');
const quad = require('rdf-quad');

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

  describe('a default instance', () => {

    let parser;

    beforeEach(() => {
      parser = new RdfXmlParser();
    });

    it('should delegate xml errors', () => {
      return expect(parse(parser, `
abc`)).rejects.toBeTruthy();
    });

    describe('should parse', () => {
      it('an empty document', async () => {
        return expect(await parse(parser, `<?xml version="1.0"?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" />`))
          .toEqual([]);
      });

      it('an empty rdf:Description', async () => {
        return expect(await parse(parser, `<?xml version="1.0"?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
            xmlns:dc="http://purl.org/dc/elements/1.1/"
            xmlns:ex="http://example.org/stuff/1.0/">
  <rdf:Description>
  </rdf:Description>
</rdf:RDF>`))
          .toEqual([]);
      });

      it('a self-closing empty rdf:Description', async () => {
        return expect(await parse(parser, `<?xml version="1.0"?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
            xmlns:dc="http://purl.org/dc/elements/1.1/"
            xmlns:ex="http://example.org/stuff/1.0/">
  <rdf:Description />
</rdf:RDF>`))
          .toEqual([]);
      });

      it('an rdf:Description without attributes', async () => {
        return expect(await parse(parser, `<?xml version="1.0"?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
            xmlns:dc="http://purl.org/dc/elements/1.1/"
            xmlns:ex="http://example.org/stuff/1.0/">
  <rdf:Description rdf:about="http://www.w3.org/TR/rdf-syntax-grammar">
  </rdf:Description>
</rdf:RDF>`))
          .toEqual([]);
      });

      it('a self-closing rdf:Description without attributes', async () => {
        return expect(await parse(parser, `<?xml version="1.0"?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
            xmlns:dc="http://purl.org/dc/elements/1.1/"
            xmlns:ex="http://example.org/stuff/1.0/">
  <rdf:Description rdf:about="http://www.w3.org/TR/rdf-syntax-grammar" />
</rdf:RDF>`))
          .toEqual([]);
      });

      it('an rdf:Description with an attribute', async () => {
        return expect(await parse(parser, `<?xml version="1.0"?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
            xmlns:dc="http://purl.org/dc/elements/1.1/"
            xmlns:ex="http://example.org/stuff/1.0/">
  <rdf:Description rdf:about="http://www.w3.org/TR/rdf-syntax-grammar"
             dc:title="RDF1.1 XML Syntax">
  </rdf:Description>
</rdf:RDF>`))
          .toEqualRdfQuadArray([
            quad('http://www.w3.org/TR/rdf-syntax-grammar',
              'http://purl.org/dc/elements/1.1/title', '"RDF1.1 XML Syntax"'),
          ]);
      });

      it('an rdf:Description without rdf:about and with an attribute', async () => {
        return expect(await parse(parser, `<?xml version="1.0"?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
            xmlns:dc="http://purl.org/dc/elements/1.1/"
            xmlns:ex="http://example.org/stuff/1.0/">
  <rdf:Description dc:title="RDF1.1 XML Syntax">
  </rdf:Description>
</rdf:RDF>`))
          .toEqualRdfQuadArray([
            quad('_:b', 'http://purl.org/dc/elements/1.1/title', '"RDF1.1 XML Syntax"'),
          ]);
      });

      it('an rdf:Description with multiple attributes', async () => {
        return expect(await parse(parser, `<?xml version="1.0"?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
            xmlns:dc="http://purl.org/dc/elements/1.1/"
            xmlns:ex="http://example.org/stuff/1.0/">
  <rdf:Description rdf:about="http://www.w3.org/TR/rdf-syntax-grammar"
             dc:title1="RDF1.1 XML Syntax"
             dc:title2="RDF1.1 XML Syntax bis">
  </rdf:Description>
</rdf:RDF>`))
          .toEqualRdfQuadArray([
            quad('http://www.w3.org/TR/rdf-syntax-grammar',
              'http://purl.org/dc/elements/1.1/title1', '"RDF1.1 XML Syntax"'),
            quad('http://www.w3.org/TR/rdf-syntax-grammar',
              'http://purl.org/dc/elements/1.1/title2', '"RDF1.1 XML Syntax bis"'),
          ]);
      });

      it('an rdf:Description without rdf:about with multiple attributes and have the same blank node', async () => {
        const array = await parse(parser, `<?xml version="1.0"?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
            xmlns:dc="http://purl.org/dc/elements/1.1/"
            xmlns:ex="http://example.org/stuff/1.0/">
  <rdf:Description dc:title1="RDF1.1 XML Syntax" dc:title2="RDF1.1 XML Syntax bis">
  </rdf:Description>
</rdf:RDF>`);
        return expect(array[0].subject).toBe(array[1].subject);
      });

      it('an rdf:Description with an empty property element', async () => {
        return expect(await parse(parser, `<?xml version="1.0"?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
            xmlns:dc="http://purl.org/dc/elements/1.1/"
            xmlns:ex="http://example.org/stuff/1.0/">
  <rdf:Description rdf:about="http://www.w3.org/TR/rdf-syntax-grammar">
    <ex:editor />
  </rdf:Description>
</rdf:RDF>`))
          .toEqualRdfQuadArray([]);
      });

      it('an rdf:Description with a valid property element', async () => {
        return expect(await parse(parser, `<?xml version="1.0"?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
            xmlns:dc="http://purl.org/dc/elements/1.1/"
            xmlns:ex="http://example.org/stuff/1.0/">
  <rdf:Description rdf:about="http://www.w3.org/TR/rdf-syntax-grammar">
    <ex:editor>
      <rdf:Description rdf:about="http://purl.org/net/dajobe/" />
    </ex:editor>
  </rdf:Description>
</rdf:RDF>`))
          .toEqualRdfQuadArray([
            quad('http://www.w3.org/TR/rdf-syntax-grammar',
              'http://example.org/stuff/1.0/editor', 'http://purl.org/net/dajobe/'),
          ]);
      });

      it('nested property tags', async () => {
        const array = await parse(parser, `<?xml version="1.0"?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
            xmlns:dc="http://purl.org/dc/elements/1.1/"
            xmlns:ex="http://example.org/stuff/1.0/">
  <rdf:Description>
    <ex:editor>
      <rdf:Description>
        <ex:homePage>
          <rdf:Description>
          </rdf:Description>
        </ex:homePage>
      </rdf:Description>
    </ex:editor>
  </rdf:Description>
</rdf:RDF>`);
        expect(array[0].object).toBe(array[1].subject);
        return expect(array)
          .toEqualRdfQuadArray([
            quad('_:b', 'http://example.org/stuff/1.0/editor', '_:b'),
            quad('_:b', 'http://example.org/stuff/1.0/homePage', '_:b'),
          ]);
      });

      it('nested property tags with IRIs', async () => {
        const array = await parse(parser, `<?xml version="1.0"?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
            xmlns:dc="http://purl.org/dc/elements/1.1/"
            xmlns:ex="http://example.org/stuff/1.0/">
  <rdf:Description rdf:about="http://www.w3.org/TR/rdf-syntax-grammar">
    <ex:editor>
      <rdf:Description>
        <ex:homePage>
          <rdf:Description rdf:about="http://purl.org/net/dajobe/">
          </rdf:Description>
        </ex:homePage>
      </rdf:Description>
    </ex:editor>
  </rdf:Description>
</rdf:RDF>`);
        expect(array[0].object).toBe(array[1].subject);
        return expect(array)
          .toEqualRdfQuadArray([
            quad('http://www.w3.org/TR/rdf-syntax-grammar', 'http://example.org/stuff/1.0/editor', '_:b'),
            quad('_:b', 'http://example.org/stuff/1.0/homePage', 'http://purl.org/net/dajobe/'),
          ]);
      });

      it('property values with strings', async () => {
        const array = await parse(parser, `<?xml version="1.0"?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
            xmlns:dc="http://purl.org/dc/elements/1.1/"
            xmlns:ex="http://example.org/stuff/1.0/">
  <rdf:Description rdf:about="http://www.w3.org/TR/rdf-syntax-grammar">
    <dc:title>RDF 1.1 XML Syntax</dc:title>
  </rdf:Description>
</rdf:RDF>`);
        return expect(array)
          .toEqualRdfQuadArray([
            quad('http://www.w3.org/TR/rdf-syntax-grammar', 'http://purl.org/dc/elements/1.1/title',
              '"RDF 1.1 XML Syntax"'),
          ]);
      });

      it('multiple rdf:Descriptions', async () => {
        const array = await parse(parser, `<?xml version="1.0"?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
            xmlns:dc="http://purl.org/dc/elements/1.1/"
            xmlns:ex="http://example.org/stuff/1.0/">
  <rdf:Description rdf:about="http://www.w3.org/TR/rdf-syntax-grammar">
    <ex:editor>
      <rdf:Description>
        <ex:homePage>
          <rdf:Description rdf:about="http://purl.org/net/dajobe/">
          </rdf:Description>
        </ex:homePage>
      </rdf:Description>
    </ex:editor>
  </rdf:Description>

  <rdf:Description rdf:about="http://www.w3.org/TR/rdf-syntax-grammar">
    <ex:editor>
      <rdf:Description>
        <ex:fullName>Dave Beckett</ex:fullName>
      </rdf:Description>
    </ex:editor>
  </rdf:Description>

  <rdf:Description rdf:about="http://www.w3.org/TR/rdf-syntax-grammar">
    <dc:title>RDF 1.1 XML Syntax</dc:title>
  </rdf:Description>
</rdf:RDF>`);
        return expect(array)
          .toEqualRdfQuadArray([
            quad('http://www.w3.org/TR/rdf-syntax-grammar', 'http://example.org/stuff/1.0/editor', '_:b'),
            quad('_:b', 'http://example.org/stuff/1.0/homePage', 'http://purl.org/net/dajobe/'),
            quad('http://www.w3.org/TR/rdf-syntax-grammar', 'http://example.org/stuff/1.0/editor', '_:b'),
            quad('_:b', 'http://example.org/stuff/1.0/fullName', '"Dave Beckett"'),
            quad('http://www.w3.org/TR/rdf-syntax-grammar', 'http://purl.org/dc/elements/1.1/title',
              '"RDF 1.1 XML Syntax"'),
          ]);
      });

      it('multiple abbreviated rdf:Descriptions', async () => {
        const array = await parse(parser, `<?xml version="1.0"?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
            xmlns:dc="http://purl.org/dc/elements/1.1/"
            xmlns:ex="http://example.org/stuff/1.0/">
  <rdf:Description rdf:about="http://www.w3.org/TR/rdf-syntax-grammar">
    <ex:editor>
      <rdf:Description>
        <ex:homePage>
          <rdf:Description rdf:about="http://purl.org/net/dajobe/">
          </rdf:Description>
        </ex:homePage>
        <ex:fullName>Dave Beckett</ex:fullName>
      </rdf:Description>
    </ex:editor>
    <dc:title>RDF 1.1 XML Syntax</dc:title>
  </rdf:Description>
</rdf:RDF>`);
        expect(array[0].object).toBe(array[1].subject);
        expect(array[0].object).toBe(array[2].subject);
        return expect(array)
          .toEqualRdfQuadArray([
            quad('http://www.w3.org/TR/rdf-syntax-grammar', 'http://example.org/stuff/1.0/editor', '_:b'),
            quad('_:b', 'http://example.org/stuff/1.0/homePage', 'http://purl.org/net/dajobe/'),
            quad('_:b', 'http://example.org/stuff/1.0/fullName', '"Dave Beckett"'),
            quad('http://www.w3.org/TR/rdf-syntax-grammar', 'http://purl.org/dc/elements/1.1/title',
              '"RDF 1.1 XML Syntax"'),
          ]);
      });

      it('empty property elements with rdf:resource', async () => {
        const array = await parse(parser, `<?xml version="1.0"?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
            xmlns:dc="http://purl.org/dc/elements/1.1/"
            xmlns:ex="http://example.org/stuff/1.0/">
  <rdf:Description rdf:about="http://www.w3.org/TR/rdf-syntax-grammar">
    <ex:homePage rdf:resource="http://purl.org/net/dajobe/" />
  </rdf:Description>
</rdf:RDF>`);
        return expect(array)
          .toEqualRdfQuadArray([
            quad('http://www.w3.org/TR/rdf-syntax-grammar', 'http://example.org/stuff/1.0/homePage',
              'http://purl.org/net/dajobe/'),
          ]);
      });

      it('empty property elements with rdf:resource and auxiliary tags', async () => {
        const array = await parse(parser, `<?xml version="1.0"?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
            xmlns:dc="http://purl.org/dc/elements/1.1/"
            xmlns:ex="http://example.org/stuff/1.0/">
  <rdf:Description rdf:about="http://www.w3.org/TR/rdf-syntax-grammar">
    <ex:homePage rdf:resource="http://purl.org/net/dajobe/" abc="unknown" />
  </rdf:Description>
</rdf:RDF>`);
        return expect(array)
          .toEqualRdfQuadArray([
            quad('http://www.w3.org/TR/rdf-syntax-grammar', 'http://example.org/stuff/1.0/homePage',
              'http://purl.org/net/dajobe/'),
          ]);
      });

      it('empty property elements with rdf:resource mixed with other tags', async () => {
        const array = await parse(parser, `<?xml version="1.0"?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
            xmlns:dc="http://purl.org/dc/elements/1.1/"
            xmlns:ex="http://example.org/stuff/1.0/">
  <rdf:Description rdf:about="http://www.w3.org/TR/rdf-syntax-grammar">
    <ex:editor>
      <rdf:Description>
        <ex:homePage rdf:resource="http://purl.org/net/dajobe/"/>
        <ex:fullName>Dave Beckett</ex:fullName>
      </rdf:Description>
    </ex:editor>
    <dc:title>RDF 1.1 XML Syntax</dc:title>
  </rdf:Description>
</rdf:RDF>`);
        expect(array[0].object).toBe(array[1].subject);
        expect(array[0].object).toBe(array[2].subject);
        return expect(array)
          .toEqualRdfQuadArray([
            quad('http://www.w3.org/TR/rdf-syntax-grammar', 'http://example.org/stuff/1.0/editor', '_:b'),
            quad('_:b', 'http://example.org/stuff/1.0/homePage', 'http://purl.org/net/dajobe/'),
            quad('_:b', 'http://example.org/stuff/1.0/fullName', '"Dave Beckett"'),
            quad('http://www.w3.org/TR/rdf-syntax-grammar', 'http://purl.org/dc/elements/1.1/title',
              '"RDF 1.1 XML Syntax"'),
          ]);
      });

      it('xml:lang on node elements', async () => {
        const array = await parse(parser, `<?xml version="1.0"?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
            xmlns:dc="http://purl.org/dc/elements/1.1/"
            xmlns:ex="http://example.org/stuff/1.0/">
  <rdf:Description rdf:about="http://www.w3.org/TR/rdf-syntax-grammar" xml:lang="en-us">
    <dc:title>RDF 1.1 XML Syntax</dc:title>
  </rdf:Description>
</rdf:RDF>`);
        return expect(array)
          .toEqualRdfQuadArray([
            quad('http://www.w3.org/TR/rdf-syntax-grammar', 'http://purl.org/dc/elements/1.1/title',
              '"RDF 1.1 XML Syntax"@en-us'),
          ]);
      });

      it('xml:lang on nested node elements', async () => {
        const array = await parse(parser, `<?xml version="1.0"?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
            xmlns:dc="http://purl.org/dc/elements/1.1/"
            xmlns:ex="http://example.org/stuff/1.0/">
  <rdf:Description rdf:about="http://www.w3.org/TR/rdf-syntax-grammar" xml:lang="en-us">
    <ex:editor>
      <rdf:Description>
        <dc:title>RDF 1.1 XML Syntax</dc:title>
      </rdf:Description>
    </ex:editor>
  </rdf:Description>
</rdf:RDF>`);
        return expect(array)
          .toEqualRdfQuadArray([
            quad('http://www.w3.org/TR/rdf-syntax-grammar', 'http://example.org/stuff/1.0/editor', '_:b'),
            quad('_:b', 'http://purl.org/dc/elements/1.1/title', '"RDF 1.1 XML Syntax"@en-us'),
          ]);
      });

      it('xml:lang resets on node elements', async () => {
        const array = await parse(parser, `<?xml version="1.0"?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
            xmlns:dc="http://purl.org/dc/elements/1.1/"
            xmlns:ex="http://example.org/stuff/1.0/">
  <rdf:Description rdf:about="http://www.w3.org/TR/rdf-syntax-grammar" xml:lang="en-us">
    <ex:editor>
      <rdf:Description xml:lang="">
        <dc:title>RDF 1.1 XML Syntax</dc:title>
      </rdf:Description>
    </ex:editor>
  </rdf:Description>
</rdf:RDF>`);
        return expect(array)
          .toEqualRdfQuadArray([
            quad('http://www.w3.org/TR/rdf-syntax-grammar', 'http://example.org/stuff/1.0/editor', '_:b'),
            quad('_:b', 'http://purl.org/dc/elements/1.1/title', '"RDF 1.1 XML Syntax"'),
          ]);
      });

      it('xml:lang on property elements', async () => {
        const array = await parse(parser, `<?xml version="1.0"?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
            xmlns:dc="http://purl.org/dc/elements/1.1/"
            xmlns:ex="http://example.org/stuff/1.0/">
  <rdf:Description rdf:about="http://www.w3.org/TR/rdf-syntax-grammar">
    <dc:title xml:lang="en-us">RDF 1.1 XML Syntax</dc:title>
  </rdf:Description>
</rdf:RDF>`);
        return expect(array)
          .toEqualRdfQuadArray([
            quad('http://www.w3.org/TR/rdf-syntax-grammar', 'http://purl.org/dc/elements/1.1/title',
              '"RDF 1.1 XML Syntax"@en-us'),
          ]);
      });

      it('xml:lang resets on property elements', async () => {
        const array = await parse(parser, `<?xml version="1.0"?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
            xmlns:dc="http://purl.org/dc/elements/1.1/"
            xmlns:ex="http://example.org/stuff/1.0/">
  <rdf:Description rdf:about="http://www.w3.org/TR/rdf-syntax-grammar" xml:lang="en-us">
    <ex:editor>
      <rdf:Description>
        <dc:title xml:lang="">RDF 1.1 XML Syntax</dc:title>
      </rdf:Description>
    </ex:editor>
  </rdf:Description>
</rdf:RDF>`);
        return expect(array)
          .toEqualRdfQuadArray([
            quad('http://www.w3.org/TR/rdf-syntax-grammar', 'http://example.org/stuff/1.0/editor', '_:b'),
            quad('_:b', 'http://purl.org/dc/elements/1.1/title', '"RDF 1.1 XML Syntax"'),
          ]);
      });

      it('mixed xml:lang usage', async () => {
        const array = await parse(parser, `<?xml version="1.0"?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
            xmlns:dc="http://purl.org/dc/elements/1.1/"
            xmlns:ex="http://example.org/stuff/1.0/">
  <rdf:Description rdf:about="http://www.w3.org/TR/rdf-syntax-grammar">
    <dc:title>RDF 1.1 XML Syntax</dc:title>
    <dc:title xml:lang="en">RDF 1.1 XML Syntax</dc:title>
    <dc:title xml:lang="en-US">RDF 1.1 XML Syntax</dc:title>
  </rdf:Description>

  <rdf:Description rdf:about="http://example.org/buecher/baum" xml:lang="de">
    <dc:title>Der Baum</dc:title>
    <dc:description>Das Buch ist außergewöhnlich</dc:description>
    <dc:title xml:lang="en">The Tree</dc:title>
  </rdf:Description>
</rdf:RDF>`);
        return expect(array)
          .toEqualRdfQuadArray([
            quad('http://www.w3.org/TR/rdf-syntax-grammar', 'http://purl.org/dc/elements/1.1/title',
              '"RDF 1.1 XML Syntax"'),
            quad('http://www.w3.org/TR/rdf-syntax-grammar', 'http://purl.org/dc/elements/1.1/title',
              '"RDF 1.1 XML Syntax"@en'),
            quad('http://www.w3.org/TR/rdf-syntax-grammar', 'http://purl.org/dc/elements/1.1/title',
              '"RDF 1.1 XML Syntax"@en-us'),
            quad('http://example.org/buecher/baum', 'http://purl.org/dc/elements/1.1/title',
              '"Der Baum"@de'),
            quad('http://example.org/buecher/baum', 'http://purl.org/dc/elements/1.1/description',
              '"Das Buch ist au\u00DFergew\u00F6hnlich"@de'),
            quad('http://example.org/buecher/baum', 'http://purl.org/dc/elements/1.1/title',
              '"The Tree"@en'),
          ]);
      });

      it('rdf:datatype on property elements', async () => {
        const array = await parse(parser, `<?xml version="1.0"?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
            xmlns:ex="http://example.org/stuff/1.0/">
  <rdf:Description rdf:about="http://example.org/item01">
    <ex:size rdf:datatype="http://www.w3.org/2001/XMLSchema#int">123</ex:size>
  </rdf:Description>
</rdf:RDF>`);
        return expect(array)
          .toEqualRdfQuadArray([
            quad('http://example.org/item01', 'http://example.org/stuff/1.0/size',
              '"123"^^http://www.w3.org/2001/XMLSchema#int'),
          ]);
      });

      it('rdf:datatype on property elements and ignore any higher-level xml:lang', async () => {
        const array = await parse(parser, `<?xml version="1.0"?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
            xmlns:ex="http://example.org/stuff/1.0/">
  <rdf:Description rdf:about="http://example.org/item01" xml:lang="en-us">
    <ex:size rdf:datatype="http://www.w3.org/2001/XMLSchema#int">123</ex:size>
  </rdf:Description>
</rdf:RDF>`);
        return expect(array)
          .toEqualRdfQuadArray([
            quad('http://example.org/item01', 'http://example.org/stuff/1.0/size',
              '"123"^^http://www.w3.org/2001/XMLSchema#int'),
          ]);
      });
    });
  });
});

function parse(parser: RdfXmlParser, input: string): Promise<RDF.Quad[]> {
  return arrayifyStream(streamifyString(input).pipe(parser));
}
