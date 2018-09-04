import * as DataFactory from "@rdfjs/data-model";
import "jest-rdf";
import * as RDF from "rdf-js";
import {SAXStream, Tag} from "sax";
import {RdfXmlParser} from "../lib/RdfXmlParser";
const streamifyString = require('streamify-string');
const arrayifyStream = require('arrayify-stream');
const quad = require('rdf-quad');

/* Test inspired by https://www.w3.org/TR/rdf-syntax-grammar/#section-Syntax-intro */
/* (Some) tests are tagged with the section they apply to  */

describe('RdfXmlParser', () => {
  it('MIME_TYPE to be \'application/rdf+xml\'', () => {
    expect(RdfXmlParser.MIME_TYPE).toEqual('application/rdf+xml');
  });

  it('should be constructable without args', () => {
    const instance = new RdfXmlParser();
    expect(instance).toBeInstanceOf(RdfXmlParser);
    expect((<any> instance).dataFactory).toBe(require('@rdfjs/data-model'));
    expect((<any> instance).baseIRI).toBe('');
    expect((<any> instance).defaultGraph).toBe(DataFactory.defaultGraph());
    expect((<any> instance).strict).toBeFalsy();
    expect((<any> instance).saxStream).toBeInstanceOf(SAXStream);
  });

  it('should be constructable with empty args', () => {
    const instance = new RdfXmlParser({});
    expect(instance).toBeInstanceOf(RdfXmlParser);
    expect((<any> instance).dataFactory).toBe(DataFactory);
    expect((<any> instance).baseIRI).toBe('');
    expect((<any> instance).defaultGraph).toBe(DataFactory.defaultGraph());
    expect((<any> instance).strict).toBeFalsy();
    expect((<any> instance).saxStream).toBeInstanceOf(SAXStream);
  });

  it('should be constructable with args with a custom data factory', () => {
    const dataFactory: any = { defaultGraph: () => 'abc' };
    const instance = new RdfXmlParser({ dataFactory });
    expect(instance).toBeInstanceOf(RdfXmlParser);
    expect((<any> instance).dataFactory).toBe(dataFactory);
    expect((<any> instance).baseIRI).toBe('');
    expect((<any> instance).defaultGraph).toBe('abc');
    expect((<any> instance).strict).toBeFalsy();
    expect((<any> instance).saxStream).toBeInstanceOf(SAXStream);
  });

  it('should be constructable with args with a custom base IRI', () => {
    const instance = new RdfXmlParser({ baseIRI: 'myBaseIRI' });
    expect(instance).toBeInstanceOf(RdfXmlParser);
    expect((<any> instance).dataFactory).toBe(DataFactory);
    expect((<any> instance).baseIRI).toEqual('myBaseIRI');
    expect((<any> instance).defaultGraph).toBe(DataFactory.defaultGraph());
    expect((<any> instance).strict).toBeFalsy();
    expect((<any> instance).saxStream).toBeInstanceOf(SAXStream);
  });

  it('should be constructable with args with a custom default graph', () => {
    const defaultGraph = DataFactory.namedNode('abc');
    const instance = new RdfXmlParser({ defaultGraph });
    expect(instance).toBeInstanceOf(RdfXmlParser);
    expect((<any> instance).dataFactory).toBe(DataFactory);
    expect((<any> instance).baseIRI).toEqual('');
    expect((<any> instance).defaultGraph).toBe(defaultGraph);
    expect((<any> instance).strict).toBeFalsy();
    expect((<any> instance).saxStream).toBeInstanceOf(SAXStream);
  });

  it('should be constructable with args with strict mode', () => {
    const instance = new RdfXmlParser({ strict: true });
    expect(instance).toBeInstanceOf(RdfXmlParser);
    expect((<any> instance).dataFactory).toBe(DataFactory);
    expect((<any> instance).baseIRI).toEqual('');
    expect((<any> instance).defaultGraph).toBe(DataFactory.defaultGraph());
    expect((<any> instance).strict).toBe(true);
    expect((<any> instance).saxStream).toBeInstanceOf(SAXStream);
  });

  it('should be constructable with args with a custom data factory, base IRI, strict and default graph', () => {
    const dataFactory: any = { defaultGraph: () => 'abc' };
    const defaultGraph = DataFactory.namedNode('abc');
    const instance = new RdfXmlParser({ dataFactory, baseIRI: 'myBaseIRI', defaultGraph, strict: true });
    expect(instance).toBeInstanceOf(RdfXmlParser);
    expect((<any> instance).dataFactory).toBe(dataFactory);
    expect((<any> instance).baseIRI).toEqual('myBaseIRI');
    expect((<any> instance).defaultGraph).toBe(defaultGraph);
    expect((<any> instance).strict).toBe(true);
    expect((<any> instance).saxStream).toBeInstanceOf(SAXStream);
  });

  describe('#parseNamespace', () => {
    it('should parse a tag without attributes', () => {
      const tag: Tag = { name: 'a', isSelfClosing: false, attributes: {} };
      return expect(RdfXmlParser.parseNamespace(tag, null)).toEqual([
        {
          xml: 'http://www.w3.org/XML/1998/namespace',
        },
      ]);
    });

    it('should parse a tag with non-xmlns attributes', () => {
      const tag: Tag = {
        attributes: {
          a: 'b',
          c: 'd',
          xmln: 'a',
          xmlnsss: 'abc',
        },
        isSelfClosing: false,
        name: 'a',
      };
      return expect(RdfXmlParser.parseNamespace(tag, null)).toEqual([
        {
          xml: 'http://www.w3.org/XML/1998/namespace',
        },
      ]);
    });

    it('should parse a tag with a default xmlns attribute', () => {
      const tag: Tag = {
        attributes: {
          xmlns: 'a',
        },
        isSelfClosing: false,
        name: 'a',
      };
      return expect(RdfXmlParser.parseNamespace(tag, null)).toEqual([
        {
          xml: 'http://www.w3.org/XML/1998/namespace',
        },
        {
          '': 'a',
        },
      ]);
    });

    it('should parse a tag with a xmlns attributes', () => {
      const tag: Tag = {
        attributes: {
          'xmlns:a': '1',
          'xmlns:b': '2',
          'xmlns:cde': '3',
        },
        isSelfClosing: false,
        name: 'a',
      };
      return expect(RdfXmlParser.parseNamespace(tag, null)).toEqual([
        {
          xml: 'http://www.w3.org/XML/1998/namespace',
        },
        {
          a: '1',
          b: '2',
          cde: '3',
        },
      ]);
    });

    it('should parse a tag with a xmlns attributes and a parent tag without ns', () => {
      const tag: Tag = {
        attributes: {
          'xmlns:a': '1',
          'xmlns:b': '2',
          'xmlns:cde': '3',
        },
        isSelfClosing: false,
        name: 'a',
      };
      return expect(RdfXmlParser.parseNamespace(tag, {})).toEqual([
        {
          xml: 'http://www.w3.org/XML/1998/namespace',
        },
        {
          a: '1',
          b: '2',
          cde: '3',
        },
      ]);
    });

    it('should parse a tag with a xmlns attributes and a parent tag with ns', () => {
      const tag: Tag = {
        attributes: {
          'xmlns:a': '1',
          'xmlns:b': '2',
          'xmlns:cde': '3',
        },
        isSelfClosing: false,
        name: 'a',
      };
      const parentTag = {
        ns: [
          { x: 'y' },
        ],
      };
      return expect(RdfXmlParser.parseNamespace(tag, parentTag)).toEqual([
        {
          x: 'y',
        },
        {
          a: '1',
          b: '2',
          cde: '3',
        },
      ]);
    });
  });

  describe('#expandPrefixedTerm', () => {

    const ns = [
      { '': 'default' },
      { x: 'y' },
      { a: 'b' },
    ];

    it('should expand a known prefix', () => {
      return expect(RdfXmlParser.expandPrefixedTerm('a:abc', ns))
        .toEqual({ local: 'abc', prefix: 'a', uri: 'b' });
    });

    it('should expand a known prefix of the parent', () => {
      return expect(RdfXmlParser.expandPrefixedTerm('x:abc', ns))
        .toEqual({ local: 'abc', prefix: 'x', uri: 'y' });
    });

    it('should expand an unknown prefix to the default ns', () => {
      return expect(RdfXmlParser.expandPrefixedTerm('z:abc', ns))
        .toEqual({ local: 'abc', prefix: 'z', uri: 'default' });
    });

    it('should expand an unknown prefix without default ns', () => {
      return expect(RdfXmlParser.expandPrefixedTerm('z:abc', [
        { x: 'y' },
        { a: 'b' },
      ])).toEqual({ local: 'abc', prefix: 'z', uri: '' });
    });

    it('should expand no prefix to the default ns', () => {
      return expect(RdfXmlParser.expandPrefixedTerm('abc', ns))
        .toEqual({ local: 'abc', prefix: '', uri: 'default' });
    });

    it('should expand an unknown prefix to the first default ns', () => {
      return expect(RdfXmlParser.expandPrefixedTerm('z:abc', [
        { '': 'default' },
        { x: 'y' },
        { '': 'firstdefault' },
        { a: 'b' },
      ])).toEqual({ local: 'abc', prefix: 'z', uri: 'firstdefault' });
    });
  });

  describe('a default instance', () => {

    let parser;

    beforeEach(() => {
      parser = new RdfXmlParser();
    });

    it('should delegate xml errors', () => {
      return expect(parse(new RdfXmlParser({ strict: true }), `
abc`)).rejects.toBeTruthy();
    });

    describe('#valueToUri', () => {
      it('create a named node from an absolute URI when no baseIRI is given', () => {
        expect(parser.valueToUri('http://example.org/', {}))
          .toEqual(DataFactory.namedNode('http://example.org/'));
      });

      it('create a named node from an absolute URI when the baseIRI is empty', () => {
        expect(parser.valueToUri('http://example.org/', { baseIRI: '' }))
          .toEqual(DataFactory.namedNode('http://example.org/'));
      });

      it('create a named node from an absolute URI when a baseIRI is given', () => {
        expect(parser.valueToUri('http://example.org/', { baseIRI: 'http://base.org/' }))
          .toEqual(DataFactory.namedNode('http://example.org/'));
      });

      it('create a named node from the baseIRI when given value is empty', () => {
        expect(parser.valueToUri('', { baseIRI: 'http://base.org/' }))
          .toEqual(DataFactory.namedNode('http://base.org/'));
      });

      it('create a named node from a relative URI when no baseIRI is given', () => {
        expect(parser.valueToUri('abc', {}))
          .toEqual(DataFactory.namedNode('abc'));
      });

      it('create a named node from a relative URI when a baseIRI is given', () => {
        expect(parser.valueToUri('abc', { baseIRI: 'http://base.org/' }))
          .toEqual(DataFactory.namedNode('http://base.org/abc'));
      });

      it('create a named node from a relative URI when a baseIRI is given and ignore the baseIRI fragment', () => {
        expect(parser.valueToUri('abc', { baseIRI: 'http://base.org/#frag' }))
          .toEqual(DataFactory.namedNode('http://base.org/abc'));
      });

      it('create a named node from a hash', () => {
        expect(parser.valueToUri('#abc', { baseIRI: 'http://base.org/' }))
          .toEqual(DataFactory.namedNode('http://base.org/#abc'));
      });

      it('create a named node and ignore the baseIRI if the value contains a colon', () => {
        expect(parser.valueToUri('http:abc', { baseIRI: 'http://base.org/' }))
          .toEqual(DataFactory.namedNode('http:abc'));
      });

      it('error for a non-absolute baseIRI', () => {
        expect(() => parser.valueToUri('abc', { baseIRI: 'def' })).toThrow();
      });

      it('create a named node that has the baseIRI scheme if the value starts with //', () => {
        expect(parser.valueToUri('//abc', { baseIRI: 'http://base.org/' }))
          .toEqual(DataFactory.namedNode('http://abc'));
      });

      it('create a named node from a baseIRI without a / in the path', () => {
        expect(parser.valueToUri('abc', { baseIRI: 'http://base.org' }))
          .toEqual(DataFactory.namedNode('http://base.org/abc'));
      });

      it('create a named node from the baseIRI scheme when the baseIRI contains only ://', () => {
        expect(parser.valueToUri('abc', { baseIRI: 'http://' }))
          .toEqual(DataFactory.namedNode('http:abc'));
      });

      it('create a named node from the baseIRI if something other than a / follows the :', () => {
        expect(parser.valueToUri('abc', { baseIRI: 'http:a' }))
          .toEqual(DataFactory.namedNode('http:a/abc'));
      });

      it('create a named node from the baseIRI scheme if nothing follows the :', () => {
        expect(parser.valueToUri('abc', { baseIRI: 'http:' }))
          .toEqual(DataFactory.namedNode('http:abc'));
      });

      it('create a named node from an absolute path and ignore the path from the base IRI', () => {
        expect(parser.valueToUri('/abc/def/', { baseIRI: 'http://base.org/123/456/' }))
          .toEqual(DataFactory.namedNode('http://base.org/abc/def/'));
      });

      it('create a named node from a baseIRI with http:// and ignore everything after the last slash', () => {
        expect(parser.valueToUri('xyz', { baseIRI: 'http://aa/a' }))
          .toEqual(DataFactory.namedNode('http://aa/xyz'));
      });

      it('create a named node from a baseIRI with http:// and collapse parent paths', () => {
        expect(parser.valueToUri('xyz', { baseIRI: 'http://aa/parent/parent/../../a' }))
          .toEqual(DataFactory.namedNode('http://aa/xyz'));
      });

      it('create a named node from a baseIRI with http:// and remove current-dir paths', () => {
        expect(parser.valueToUri('xyz', { baseIRI: 'http://aa/././a' }))
          .toEqual(DataFactory.namedNode('http://aa/xyz'));
      });
    });

    describe('should error', () => {
      // 2.10
      it('on node elements with both rdf:about and rdf:nodeID', async () => {
        return expect(parse(parser, `<?xml version="1.0"?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
            xmlns:dc="http://purl.org/dc/elements/1.1/"
            xmlns:ex="http://example.org/stuff/1.0/">
  <rdf:Description rdf:about="http://www.w3.org/TR/rdf-syntax-grammar" rdf:nodeID="abc" />
</rdf:RDF>`)).rejects.toEqual(
          new Error('Only one of rdf:about, rdf:nodeID and rdf:ID can be present, ' +
            'while abc and http://www.w3.org/TR/rdf-syntax-grammar where found.'));
      });

      // 2.10
      it('on node elements with both rdf:nodeID and rdf:about', async () => {
        return expect(parse(parser, `<?xml version="1.0"?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
            xmlns:dc="http://purl.org/dc/elements/1.1/"
            xmlns:ex="http://example.org/stuff/1.0/">
  <rdf:Description rdf:nodeID="abc" rdf:about="http://www.w3.org/TR/rdf-syntax-grammar" />
</rdf:RDF>`)).rejects.toEqual(
          new Error('Only one of rdf:about, rdf:nodeID and rdf:ID can be present, ' +
            'while http://www.w3.org/TR/rdf-syntax-grammar and abc where found.'));
      });

      // 2.10
      it('on node elements with both rdf:ID and rdf:nodeID', async () => {
        return expect(parse(parser, `<?xml version="1.0"?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
            xmlns:dc="http://purl.org/dc/elements/1.1/"
            xmlns:ex="http://example.org/stuff/1.0/">
  <rdf:Description rdf:ID="xyz" rdf:nodeID="abc" />
</rdf:RDF>`)).rejects.toEqual(
          new Error('Only one of rdf:about, rdf:nodeID and rdf:ID can be present, ' +
            'while abc and #xyz where found.'));
      });

      // 2.10
      it('on node elements with both rdf:nodeID and rdf:ID', async () => {
        return expect(parse(parser, `<?xml version="1.0"?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
            xmlns:dc="http://purl.org/dc/elements/1.1/"
            xmlns:ex="http://example.org/stuff/1.0/">
  <rdf:Description rdf:nodeID="abc" rdf:ID="xyz" />
</rdf:RDF>`)).rejects.toEqual(
          new Error('Only one of rdf:about, rdf:nodeID and rdf:ID can be present, ' +
            'while xyz and abc where found.'));
      });

      // 2.10
      it('on node elements with both rdf:about and rdf:ID', async () => {
        return expect(parse(parser, `<?xml version="1.0"?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
            xmlns:dc="http://purl.org/dc/elements/1.1/"
            xmlns:ex="http://example.org/stuff/1.0/">
  <rdf:Description rdf:about="http://www.w3.org/TR/rdf-syntax-grammar" rdf:ID="abc" />
</rdf:RDF>`)).rejects.toEqual(
          new Error('Only one of rdf:about, rdf:nodeID and rdf:ID can be present, ' +
            'while abc and http://www.w3.org/TR/rdf-syntax-grammar where found.'));
      });

      // 2.10
      it('on node elements with both rdf:ID and rdf:about', async () => {
        return expect(parse(parser, `<?xml version="1.0"?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
            xmlns:dc="http://purl.org/dc/elements/1.1/"
            xmlns:ex="http://example.org/stuff/1.0/">
  <rdf:Description rdf:ID="abc" rdf:about="http://www.w3.org/TR/rdf-syntax-grammar" />
</rdf:RDF>`)).rejects.toEqual(
          new Error('Only one of rdf:about, rdf:nodeID and rdf:ID can be present, ' +
            'while http://www.w3.org/TR/rdf-syntax-grammar and #abc where found.'));
      });

      // 2.10
      it('when multiple equal rdf:ID occurrences on node elements are found', async () => {
        return expect(parse(parser, `<?xml version="1.0"?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
            xmlns:dc="http://purl.org/dc/elements/1.1/"
            xmlns:ex="http://example.org/stuff/1.0/">
  <rdf:Description rdf:ID="abc" />
  <rdf:Description rdf:ID="def" />
  <rdf:Description rdf:ID="abc" />
</rdf:RDF>`)).rejects.toEqual(
          new Error('Found multiple occurrences of rdf:ID=\'#abc\'.'));
      });

      // 2.17
      it('when multiple equal rdf:ID occurrences on property elements are found', async () => {
        return expect(parse(parser, `<?xml version="1.0"?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
            xmlns:dc="http://purl.org/dc/elements/1.1/"
            xmlns:ex="http://example.org/stuff/1.0/">
  <rdf:Description>
    <ex:prop rdf:ID="abc">1</ex:prop>
    <ex:prop rdf:ID="abc">2</ex:prop>
  <rdf:Description>
</rdf:RDF>`)).rejects.toEqual(
          new Error('Found multiple occurrences of rdf:ID=\'#abc\'.'));
      });

      // 2.10, 2.17
      it('when multiple equal rdf:ID occurrences on node and property elements are found', async () => {
        return expect(parse(parser, `<?xml version="1.0"?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
            xmlns:dc="http://purl.org/dc/elements/1.1/"
            xmlns:ex="http://example.org/stuff/1.0/">
  <rdf:Description rdf:ID="abc">
    <ex:prop rdf:ID="abc">1</ex:prop>
  <rdf:Description>
</rdf:RDF>`)).rejects.toEqual(
          new Error('Found multiple occurrences of rdf:ID=\'#abc\'.'));
      });

      // 2.10
      it('on property elements with both rdf:nodeID and rdf:about', async () => {
        return expect(parse(parser, `<?xml version="1.0"?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
            xmlns:dc="http://purl.org/dc/elements/1.1/"
            xmlns:ex="http://example.org/stuff/1.0/">
  <rdf:Description rdf:about="http://www.w3.org/TR/rdf-syntax-grammar">
    <ex:editor rdf:nodeID="abc" rdf:resource="http://www.w3.org/TR/rdf-syntax-grammar" />
  </rdf:Description>
</rdf:RDF>`)).rejects.toEqual(
          new Error('Found both rdf:resource (http://www.w3.org/TR/rdf-syntax-grammar) and rdf:nodeID (abc).'));
      });

      // 2.10
      it('on property elements with both rdf:nodeID and rdf:about', async () => {
        return expect(parse(parser, `<?xml version="1.0"?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
            xmlns:dc="http://purl.org/dc/elements/1.1/"
            xmlns:ex="http://example.org/stuff/1.0/">
  <rdf:Description rdf:about="http://www.w3.org/TR/rdf-syntax-grammar">
    <ex:editor rdf:resource="http://www.w3.org/TR/rdf-syntax-grammar" rdf:nodeID="abc" />
  </rdf:Description>
</rdf:RDF>`)).rejects.toEqual(new Error('Found both rdf:resource and rdf:nodeID (abc).'));
      });

      // 2.11
      it('on property elements with both rdf:parseType="Resource" and rdf:resource', async () => {
        return expect(parse(parser, `<?xml version="1.0"?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
            xmlns:dc="http://purl.org/dc/elements/1.1/"
            xmlns:ex="http://example.org/stuff/1.0/">
  <rdf:Description rdf:about="http://www.w3.org/TR/rdf-syntax-grammar">
    <ex:editor rdf:parseType="Resource" rdf:resource="http://www.w3.org/TR/rdf-syntax-grammar" />
  </rdf:Description>
</rdf:RDF>`)).rejects.toEqual(
          new Error('rdf:parseType="Resource" is not allowed on property elements with rdf:resource ' +
            '(http://www.w3.org/TR/rdf-syntax-grammar)'));
      });

      // 2.11
      it('on property elements with both rdf:parseType="Resource" and rdf:datatype', async () => {
        return expect(parse(parser, `<?xml version="1.0"?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
            xmlns:dc="http://purl.org/dc/elements/1.1/"
            xmlns:ex="http://example.org/stuff/1.0/">
  <rdf:Description rdf:about="http://www.w3.org/TR/rdf-syntax-grammar">
    <ex:editor rdf:parseType="Resource" rdf:datatype="http://www.w3.org/TR/rdf-syntax-grammar" />
  </rdf:Description>
</rdf:RDF>`)).rejects.toEqual(
          new Error('rdf:parseType="Resource" is not allowed on property elements with rdf:datatype ' +
            '(http://www.w3.org/TR/rdf-syntax-grammar)'));
      });

      // 2.12
      it('on property elements with both non-rdf:* properties and rdf:datatype', async () => {
        return expect(parse(parser, `<?xml version="1.0"?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
            xmlns:dc="http://purl.org/dc/elements/1.1/"
            xmlns:ex="http://example.org/stuff/1.0/">
  <rdf:Description rdf:about="http://www.w3.org/TR/rdf-syntax-grammar">
    <ex:editor dc:title="xyz" rdf:datatype="http://www.w3.org/TR/rdf-syntax-grammar" />
  </rdf:Description>
</rdf:RDF>`)).rejects.toEqual(new Error('Found both non-rdf:* property attributes and rdf:datatype ' +
          '(http://www.w3.org/TR/rdf-syntax-grammar).'));
      });

      // 2.11
      it('on property elements with both rdf:parseType="Resource" and rdf:nodeID', async () => {
        return expect(parse(parser, `<?xml version="1.0"?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
            xmlns:dc="http://purl.org/dc/elements/1.1/"
            xmlns:ex="http://example.org/stuff/1.0/">
  <rdf:Description rdf:about="http://www.w3.org/TR/rdf-syntax-grammar">
    <ex:editor rdf:parseType="Resource" rdf:nodeID="abc" />
  </rdf:Description>
</rdf:RDF>`)).rejects.toEqual(new Error('rdf:parseType="Resource" is not allowed on property elements ' +
          'with rdf:nodeID (abc)'));
      });

      // 2.12
      it('on property elements with both non-rdf:* properties and rdf:nodeID', async () => {
        return expect(parse(parser, `<?xml version="1.0"?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
            xmlns:dc="http://purl.org/dc/elements/1.1/"
            xmlns:ex="http://example.org/stuff/1.0/">
  <rdf:Description rdf:about="http://www.w3.org/TR/rdf-syntax-grammar">
    <ex:editor dc:title="xyz" rdf:nodeID="abc" />
  </rdf:Description>
</rdf:RDF>`)).rejects.toEqual(new Error('Found both non-rdf:* property attributes and rdf:nodeID (abc).'));
      });

      // 2.11
      it('on property elements with both rdf:resource and rdf:parseType="Resource"', async () => {
        return expect(parse(parser, `<?xml version="1.0"?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
            xmlns:dc="http://purl.org/dc/elements/1.1/"
            xmlns:ex="http://example.org/stuff/1.0/">
  <rdf:Description rdf:about="http://www.w3.org/TR/rdf-syntax-grammar">
    <ex:editor rdf:resource="http://www.w3.org/TR/rdf-syntax-grammar" rdf:parseType="Resource" />
  </rdf:Description>
</rdf:RDF>`)).rejects.toEqual(
          new Error('rdf:parseType="Resource" is not allowed on property elements with rdf:nodeID ' +
            'or rdf:resource (http://www.w3.org/TR/rdf-syntax-grammar)'));
      });

      // 2.12
      it('on property elements with both rdf:datatype and rdf:parseType="Resource"', async () => {
        return expect(parse(parser, `<?xml version="1.0"?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
            xmlns:dc="http://purl.org/dc/elements/1.1/"
            xmlns:ex="http://example.org/stuff/1.0/">
  <rdf:Description rdf:about="http://www.w3.org/TR/rdf-syntax-grammar">
    <ex:editor rdf:datatype="http://www.w3.org/TR/rdf-syntax-grammar" rdf:parseType="Resource" />
  </rdf:Description>
</rdf:RDF>`)).rejects.toEqual(
          new Error('rdf:parseType="Resource" is not allowed on property elements with rdf:datatype ' +
            '(http://www.w3.org/TR/rdf-syntax-grammar)'));
      });

      // 2.11
      it('on property elements with both rdf:nodeID and rdf:parseType="Resource"', async () => {
        return expect(parse(parser, `<?xml version="1.0"?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
            xmlns:dc="http://purl.org/dc/elements/1.1/"
            xmlns:ex="http://example.org/stuff/1.0/">
  <rdf:Description rdf:about="http://www.w3.org/TR/rdf-syntax-grammar">
    <ex:editor rdf:nodeID="abc" rdf:parseType="Resource" />
  </rdf:Description>
</rdf:RDF>`)).rejects.toEqual(new Error('rdf:parseType="Resource" is not allowed on property elements with ' +
          'rdf:nodeID or rdf:resource (abc)'));
      });

      // 2.11, 2.12
      it('on property elements with attributes and rdf:parseType="Resource"', async () => {
        return expect(parse(parser, `<?xml version="1.0"?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
            xmlns:dc="http://purl.org/dc/elements/1.1/"
            xmlns:ex="http://example.org/stuff/1.0/">
  <rdf:Description rdf:about="http://www.w3.org/TR/rdf-syntax-grammar">
    <ex:editor dc:title="abc" rdf:parseType="Resource" />
  </rdf:Description>
</rdf:RDF>`)).rejects.toEqual(new Error('rdf:parseType="Resource" is not allowed when non-rdf:* property attributes ' +
          'are present'));
      });

      // 2.11
      it('on property elements with rdf:parseType="Resource" and attributes', async () => {
        return expect(parse(parser, `<?xml version="1.0"?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
            xmlns:dc="http://purl.org/dc/elements/1.1/"
            xmlns:ex="http://example.org/stuff/1.0/">
  <rdf:Description rdf:about="http://www.w3.org/TR/rdf-syntax-grammar">
    <ex:editor rdf:parseType="Resource" dc:title="abc" />
  </rdf:Description>
</rdf:RDF>`)).rejects.toEqual(new Error('Found illegal rdf:* properties on property element with attribute: abc'));
      });

      // 2.12
      it('on property elements with rdf:datatype and attributes', async () => {
        return expect(parse(parser, `<?xml version="1.0"?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
            xmlns:dc="http://purl.org/dc/elements/1.1/"
            xmlns:ex="http://example.org/stuff/1.0/">
  <rdf:Description rdf:about="http://www.w3.org/TR/rdf-syntax-grammar">
    <ex:editor rdf:datatype="xyy" dc:title="abc" />
  </rdf:Description>
</rdf:RDF>`)).rejects.toEqual(new Error('Found illegal rdf:* properties on property element with attribute: abc'));
      });
    });

    describe('should parse', () => {
      // 2.6
      it('an empty document', async () => {
        return expect(await parse(parser, `<?xml version="1.0"?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" />`))
          .toEqual([]);
      });

      // 2.6
      it('and ignore unknown xml:* attributes', async () => {
        return expect(await parse(parser, `<?xml version="1.0"?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
            xmlns:dc="http://purl.org/dc/elements/1.1/"
            xmlns:ex="http://example.org/stuff/1.0/"
            xml:bla="bla">
  <rdf:Description>
  </rdf:Description>
</rdf:RDF>`))
          .toEqual([]);
      });

      // 2.6
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

      // 2.6
      it('a self-closing empty rdf:Description', async () => {
        return expect(await parse(parser, `<?xml version="1.0"?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
            xmlns:dc="http://purl.org/dc/elements/1.1/"
            xmlns:ex="http://example.org/stuff/1.0/">
  <rdf:Description />
</rdf:RDF>`))
          .toEqual([]);
      });

      // 2.6
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

      // 2.6
      it('a self-closing rdf:Description without attributes', async () => {
        return expect(await parse(parser, `<?xml version="1.0"?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
            xmlns:dc="http://purl.org/dc/elements/1.1/"
            xmlns:ex="http://example.org/stuff/1.0/">
  <rdf:Description rdf:about="http://www.w3.org/TR/rdf-syntax-grammar" />
</rdf:RDF>`))
          .toEqual([]);
      });

      // 2.5
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

      it('DOCTYPE and ENTITY\'s', async () => {
        return expect(await parse(parser, `<!DOCTYPE rdf:RDF
[<!ENTITY rdf "http://www.w3.org/1999/02/22-rdf-syntax-ns#">
 <!ENTITY dc "http://purl.org/dc/elements/1.1/">
 ]>
<rdf:RDF xmlns:rdf="&rdf;"
            xmlns:dc="&dc;">
  <rdf:Description rdf:about="http://www.w3.org/TR/rdf-syntax-grammar"
             dc:title="RDF1.1 XML Syntax">
  </rdf:Description>
</rdf:RDF>`))
          .toEqualRdfQuadArray([
            quad('http://www.w3.org/TR/rdf-syntax-grammar',
              'http://purl.org/dc/elements/1.1/title', '"RDF1.1 XML Syntax"'),
          ]);
      });

      // 2.5
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

      // 2.5
      it('an rdf:Description without rdf:about and with an attribute with a custom default', async () => {
        const myParser = new RdfXmlParser({ defaultGraph: DataFactory.namedNode('http://example.org/g1') });
        return expect(await parse(myParser, `<?xml version="1.0"?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
            xmlns:dc="http://purl.org/dc/elements/1.1/"
            xmlns:ex="http://example.org/stuff/1.0/">
  <rdf:Description dc:title="RDF1.1 XML Syntax">
  </rdf:Description>
</rdf:RDF>`))
          .toEqualRdfQuadArray([
            quad('_:b', 'http://purl.org/dc/elements/1.1/title', '"RDF1.1 XML Syntax"', 'http://example.org/g1'),
          ]);
      });

      // 2.5
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

      // 2.5
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

      it('an rdf:Description with an empty property element should define an empty literal', async () => {
        return expect(await parse(parser, `<?xml version="1.0"?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
            xmlns:dc="http://purl.org/dc/elements/1.1/"
            xmlns:ex="http://example.org/stuff/1.0/">
  <rdf:Description rdf:about="http://www.w3.org/TR/rdf-syntax-grammar">
    <ex:editor />
  </rdf:Description>
</rdf:RDF>`))
          .toEqualRdfQuadArray([
            quad('http://www.w3.org/TR/rdf-syntax-grammar',
              'http://example.org/stuff/1.0/editor', '""'),
          ]);
      });

      // 2.2
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

      // 2.2
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

      // 2.2
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

      // 2.3
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

      // 2.3
      it('property values with empty strings', async () => {
        const array = await parse(parser, `<?xml version="1.0"?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
            xmlns:dc="http://purl.org/dc/elements/1.1/"
            xmlns:ex="http://example.org/stuff/1.0/">
  <rdf:Description rdf:about="http://www.w3.org/TR/rdf-syntax-grammar">
    <dc:title></dc:title>
  </rdf:Description>
</rdf:RDF>`);
        return expect(array)
          .toEqualRdfQuadArray([
            quad('http://www.w3.org/TR/rdf-syntax-grammar', 'http://purl.org/dc/elements/1.1/title', '""'),
          ]);
      });
      // 2.2
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

      // 2.3
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

      // 2.4
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

      // 2.4
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

      // 2.7
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

      // 2.7
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

      // 2.7
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

      // 2.7
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

      // 2.7
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

      // 2.7
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

      // 2.9
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

      // 2.9
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

      // 2.10
      it('rdf:nodeID on property elements as blank nodes', async () => {
        const array = await parse(parser, `<?xml version="1.0"?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
            xmlns:ex="http://example.org/stuff/1.0/">
  <rdf:Description rdf:about="http://www.w3.org/TR/rdf-syntax-grammar">
    <ex:editor rdf:nodeID="abc"/>
  </rdf:Description>
</rdf:RDF>`);
        expect(array[0].object).toEqual(DataFactory.blankNode('abc'));
        return expect(array)
          .toEqualRdfQuadArray([
            quad('http://www.w3.org/TR/rdf-syntax-grammar', 'http://example.org/stuff/1.0/editor',
              '_:b'),
          ]);
      });

      // 2.10
      it('rdf:nodeID on node elements as blank nodes', async () => {
        const array = await parse(parser, `<?xml version="1.0"?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
            xmlns:ex="http://example.org/stuff/1.0/">
  <rdf:Description rdf:nodeID="abc" ex:fullName="Dave Beckett" />
</rdf:RDF>`);
        expect(array[0].subject).toEqual(DataFactory.blankNode('abc'));
        return expect(array)
          .toEqualRdfQuadArray([
            quad('_b', 'http://example.org/stuff/1.0/fullName', '"Dave Beckett"'),
          ]);
      });

      // 2.10
      it('rdf:nodeID on mixed node elements', async () => {
        const array = await parse(parser, `<?xml version="1.0"?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
            xmlns:dc="http://purl.org/dc/elements/1.1/"
            xmlns:ex="http://example.org/stuff/1.0/">
  <rdf:Description rdf:about="http://www.w3.org/TR/rdf-syntax-grammar"
             dc:title="RDF/XML Syntax Specification (Revised)">
    <ex:editor rdf:nodeID="abc"/>
  </rdf:Description>

  <rdf:Description rdf:nodeID="abc" ex:fullName="Dave Beckett">
    <ex:homePage rdf:resource="http://purl.org/net/dajobe/"/>
  </rdf:Description>
</rdf:RDF>`);
        expect(array[1].object).toEqual(DataFactory.blankNode('abc'));
        expect(array[2].subject).toEqual(DataFactory.blankNode('abc'));
        expect(array[3].subject).toEqual(DataFactory.blankNode('abc'));
        return expect(array)
          .toEqualRdfQuadArray([
            quad('http://www.w3.org/TR/rdf-syntax-grammar', 'http://purl.org/dc/elements/1.1/title',
              '"RDF/XML Syntax Specification (Revised)"'),
            quad('http://www.w3.org/TR/rdf-syntax-grammar', 'http://example.org/stuff/1.0/editor', '_:b'),
            quad('_b', 'http://example.org/stuff/1.0/fullName', '"Dave Beckett"'),
            quad('_b', 'http://example.org/stuff/1.0/homePage', 'http://purl.org/net/dajobe/'),
          ]);
      });

      // 2.11
      it('nested property elements with rdf:parseType="resource"', async () => {
        const array = await parse(parser, `<?xml version="1.0"?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
            xmlns:dc="http://purl.org/dc/elements/1.1/"
            xmlns:ex="http://example.org/stuff/1.0/">
  <rdf:Description rdf:about="http://www.w3.org/TR/rdf-syntax-grammar"
                   dc:title="RDF/XML Syntax Specification (Revised)">
    <ex:editor rdf:parseType="Resource">
      <ex:fullName>Dave Beckett</ex:fullName>
      <ex:homePage rdf:resource="http://purl.org/net/dajobe/"/>
    </ex:editor>
  </rdf:Description>
</rdf:RDF>`);
        expect(array[1].object).toBe(array[2].subject);
        expect(array[1].object).toBe(array[3].subject);
        return expect(array)
          .toEqualRdfQuadArray([
            quad('http://www.w3.org/TR/rdf-syntax-grammar', 'http://purl.org/dc/elements/1.1/title',
              '"RDF/XML Syntax Specification (Revised)"'),
            quad('http://www.w3.org/TR/rdf-syntax-grammar', 'http://example.org/stuff/1.0/editor', '_:b'),
            quad('_b', 'http://example.org/stuff/1.0/fullName', '"Dave Beckett"'),
            quad('_b', 'http://example.org/stuff/1.0/homePage', 'http://purl.org/net/dajobe/'),
          ]);
      });

      // 2.11
      it('and ignore rdf:parseType="resource"', async () => {
        const array = await parse(parser, `<?xml version="1.0"?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
            xmlns:dc="http://purl.org/dc/elements/1.1/"
            xmlns:ex="http://example.org/stuff/1.0/">
  <rdf:Description rdf:about="http://www.w3.org/TR/rdf-syntax-grammar"
                   dc:title="RDF/XML Syntax Specification (Revised)">
    <ex:editor rdf:parseType="resource" rdf:nodeID="abc" />
  </rdf:Description>
</rdf:RDF>`);
        return expect(array)
          .toEqualRdfQuadArray([
            quad('http://www.w3.org/TR/rdf-syntax-grammar', 'http://purl.org/dc/elements/1.1/title',
              '"RDF/XML Syntax Specification (Revised)"'),
            quad('http://www.w3.org/TR/rdf-syntax-grammar', 'http://example.org/stuff/1.0/editor', '_:b'),
          ]);
      });

      // 2.12
      it('property attributes on empty property elements', async () => {
        const array = await parse(parser, `<?xml version="1.0"?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
            xmlns:dc="http://purl.org/dc/elements/1.1/"
            xmlns:ex="http://example.org/stuff/1.0/">
  <rdf:Description rdf:about="http://www.w3.org/TR/rdf-syntax-grammar"
            dc:title="RDF/XML Syntax Specification (Revised)">
    <ex:editor ex:fullName="Dave Beckett" />
  </rdf:Description>
</rdf:RDF>`);
        expect(array[1].object).toBe(array[2].subject);
        return expect(array)
          .toEqualRdfQuadArray([
            quad('http://www.w3.org/TR/rdf-syntax-grammar', 'http://purl.org/dc/elements/1.1/title',
              '"RDF/XML Syntax Specification (Revised)"'),
            quad('http://www.w3.org/TR/rdf-syntax-grammar', 'http://example.org/stuff/1.0/editor', '_:b'),
            quad('_b', 'http://example.org/stuff/1.0/fullName', '"Dave Beckett"'),
          ]);
      });

      // 2.13
      it('non-compacted typed node elements', async () => {
        const array = await parse(parser, `<?xml version="1.0"?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
            xmlns:dc="http://purl.org/dc/elements/1.1/"
            xmlns:ex="http://example.org/stuff/1.0/">
  <rdf:Description rdf:about="http://example.org/thing">
    <rdf:type rdf:resource="http://example.org/stuff/1.0/Document"/>
    <dc:title>A marvelous thing</dc:title>
  </rdf:Description>
</rdf:RDF>`);
        return expect(array)
          .toEqualRdfQuadArray([
            quad('http://example.org/thing', 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type',
              'http://example.org/stuff/1.0/Document'),
            quad('http://example.org/thing', 'http://purl.org/dc/elements/1.1/title',
              '"A marvelous thing"'),
          ]);
      });

      // 2.13
      it('typed node elements', async () => {
        const array = await parse(parser, `<?xml version="1.0"?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
            xmlns:dc="http://purl.org/dc/elements/1.1/"
            xmlns:ex="http://example.org/stuff/1.0/">
  <ex:Document rdf:about="http://example.org/thing">
    <dc:title>A marvelous thing</dc:title>
  </ex:Document>
</rdf:RDF>`);
        return expect(array)
          .toEqualRdfQuadArray([
            quad('http://example.org/thing', 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type',
              'http://example.org/stuff/1.0/Document'),
            quad('http://example.org/thing', 'http://purl.org/dc/elements/1.1/title',
              '"A marvelous thing"'),
          ]);
      });

      // 2.14
      it('shortened URIs in rdf:about, rdf:resource and rdf:datatype with xml:base on the root tag', async () => {
        const array = await parse(parser, `<?xml version="1.0"?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
            xmlns:ex="http://example.org/stuff/1.0/"
            xml:base="http://example.org/here/">
  <rdf:Description rdf:about="snack">
    <ex:prop rdf:resource="fruit/apple"/>
    <ex:prop2 rdf:resource="http://example.org/"/>
    <ex:editor rdf:datatype="abc">def</ex:editor>
  </rdf:Description>
</rdf:RDF>`);
        return expect(array)
          .toEqualRdfQuadArray([
            quad('http://example.org/here/snack', 'http://example.org/stuff/1.0/prop',
              'http://example.org/here/fruit/apple'),
            quad('http://example.org/here/snack', 'http://example.org/stuff/1.0/prop2',
              'http://example.org/'),
            quad('http://example.org/here/snack', 'http://example.org/stuff/1.0/editor',
              '"def"^^http://example.org/here/abc'),
          ]);
      });

      // 2.14
      it('shortened URIs in rdf:about, rdf:resource and rdf:datatype with xml:base in the parser options', async () => {
        const parserThis = new RdfXmlParser({ baseIRI: 'http://example.org/here/' });
        const array = await parse(parserThis, `<?xml version="1.0"?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
            xmlns:ex="http://example.org/stuff/1.0/">
  <rdf:Description rdf:about="snack">
    <ex:prop rdf:resource="fruit/apple"/>
    <ex:prop2 rdf:resource="http://example.org/"/>
    <ex:editor rdf:datatype="abc">def</ex:editor>
  </rdf:Description>
</rdf:RDF>`);
        return expect(array)
          .toEqualRdfQuadArray([
            quad('http://example.org/here/snack', 'http://example.org/stuff/1.0/prop',
              'http://example.org/here/fruit/apple'),
            quad('http://example.org/here/snack', 'http://example.org/stuff/1.0/prop2',
              'http://example.org/'),
            quad('http://example.org/here/snack', 'http://example.org/stuff/1.0/editor',
              '"def"^^http://example.org/here/abc'),
          ]);
      });

      // 2.14
      it('shortened URIs in rdf:about, rdf:resource and rdf:datatype with xml:base on the root and inner tag',
        async () => {
          const array = await parse(parser, `<?xml version="1.0"?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
            xmlns:ex="http://example.org/stuff/1.0/"
            xml:base="http://example.org/here/">
  <rdf:Description rdf:about="snack" xml:base="http://example.org/here2/">
    <ex:prop rdf:resource="fruit/apple"/>
    <ex:prop2 rdf:resource="http://example.org/"/>
    <ex:editor rdf:datatype="abc">def</ex:editor>
  </rdf:Description>
</rdf:RDF>`);
          return expect(array)
            .toEqualRdfQuadArray([
              quad('http://example.org/here2/snack', 'http://example.org/stuff/1.0/prop',
                'http://example.org/here2/fruit/apple'),
              quad('http://example.org/here2/snack', 'http://example.org/stuff/1.0/prop2',
                'http://example.org/'),
              quad('http://example.org/here2/snack', 'http://example.org/stuff/1.0/editor',
                '"def"^^http://example.org/here2/abc'),
            ]);
        });

      // 2.14
      it('rdf:ID with xml:base on the root tag', async () => {
        const array = await parse(parser, `<?xml version="1.0"?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
            xmlns:ex="http://example.org/stuff/1.0/"
            xml:base="http://example.org/here/">
  <rdf:Description rdf:ID="snack">
    <ex:prop rdf:resource="fruit/apple"/>
  </rdf:Description>
</rdf:RDF>`);
        return expect(array)
          .toEqualRdfQuadArray([
            quad('http://example.org/here/#snack', 'http://example.org/stuff/1.0/prop',
              'http://example.org/here/fruit/apple'),
          ]);
      });

      // 2.14
      it('With an xml:base with fragment the fragment is ignored', async () => {
        const array = await parse(parser, `<?xml version="1.0"?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
         xmlns:eg="http://example.org/"
         xml:base="http://example.org/dir/file#frag">
  <eg:type rdf:about="" />
  <rdf:Description rdf:ID="foo" >
    <eg:value rdf:resource="relpath" />
  </rdf:Description>
</rdf:RDF>`);
        return expect(array)
          .toEqualRdfQuadArray([
            quad('http://example.org/dir/file', 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type',
              'http://example.org/type'),
            quad('http://example.org/dir/file#foo', 'http://example.org/value', 'http://example.org/dir/relpath'),
          ]);
      });

      // 2.14
      it('With an xml:base in an rdf:Description should apply it to the node itself', async () => {
        const array = await parse(parser, `<?xml version="1.0"?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
         xmlns:eg="http://example.org/"
         xml:base="http://example.org/dir/file">
  <rdf:Description rdf:ID="frag" eg:value="v" xml:base="http://example.org/file2"/>
  <eg:type rdf:about="relFile" />
</rdf:RDF>`);
        return expect(array)
          .toEqualRdfQuadArray([
            quad('http://example.org/file2#frag', 'http://example.org/value', '"v"'),
            quad('http://example.org/dir/relFile', 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type',
              'http://example.org/type'),
          ]);
      });

      // 2.15
      it('rdf:li properties', async () => {
        const array = await parse(parser, `<?xml version="1.0"?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
  <rdf:Seq rdf:about="http://example.org/favourite-fruit">
    <rdf:li rdf:resource="http://example.org/banana"/>
    <rdf:li rdf:resource="http://example.org/apple"/>
    <rdf:li rdf:resource="http://example.org/pear"/>
  </rdf:Seq>
</rdf:RDF>`);
        return expect(array)
          .toEqualRdfQuadArray([
            quad('http://example.org/favourite-fruit', 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type',
              'http://www.w3.org/1999/02/22-rdf-syntax-ns#Seq'),
            quad('http://example.org/favourite-fruit', 'http://www.w3.org/1999/02/22-rdf-syntax-ns#_1',
              'http://example.org/banana'),
            quad('http://example.org/favourite-fruit', 'http://www.w3.org/1999/02/22-rdf-syntax-ns#_2',
              'http://example.org/apple'),
            quad('http://example.org/favourite-fruit', 'http://www.w3.org/1999/02/22-rdf-syntax-ns#_3',
              'http://example.org/pear'),
          ]);
      });

      // 2.16
      it('properties in a rdf:parseType="Collection" to a linked list', async () => {
        const array = await parse(parser, `<?xml version="1.0"?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
         xmlns:ex="http://example.org/stuff/1.0/">
  <rdf:Description rdf:about="http://example.org/basket">
    <ex:hasFruit rdf:parseType="Collection">
      <rdf:Description rdf:about="http://example.org/banana"/>
      <rdf:Description rdf:about="http://example.org/apple"/>
      <rdf:Description rdf:about="http://example.org/pear"/>
    </ex:hasFruit>
  </rdf:Description>
</rdf:RDF>`);
        expect(array[0].object).toBe(array[1].subject);
        expect(array[0].object).toBe(array[2].subject);
        expect(array[2].object).toBe(array[3].subject);
        expect(array[2].object).toBe(array[4].subject);
        expect(array[4].object).toBe(array[5].subject);
        expect(array[4].object).toBe(array[6].subject);
        return expect(array)
          .toEqualRdfQuadArray([
            quad('http://example.org/basket', 'http://example.org/stuff/1.0/hasFruit', '_:b'),
            quad('_:b', 'http://www.w3.org/1999/02/22-rdf-syntax-ns#first', 'http://example.org/banana'),
            quad('_:b', 'http://www.w3.org/1999/02/22-rdf-syntax-ns#rest', '_:b'),
            quad('_:b', 'http://www.w3.org/1999/02/22-rdf-syntax-ns#first', 'http://example.org/apple'),
            quad('_:b', 'http://www.w3.org/1999/02/22-rdf-syntax-ns#rest', '_:b'),
            quad('_:b', 'http://www.w3.org/1999/02/22-rdf-syntax-ns#first', 'http://example.org/pear'),
            quad('_:b', 'http://www.w3.org/1999/02/22-rdf-syntax-ns#rest',
              'http://www.w3.org/1999/02/22-rdf-syntax-ns#nil'),
          ]);
      });

      // 2.16
      it('zero properties in an empty tag in a rdf:parseType="Collection" to a linked list', async () => {
        const array = await parse(parser, `<?xml version="1.0"?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
         xmlns:ex="http://example.org/stuff/1.0/">
  <rdf:Description rdf:about="http://example.org/basket">
    <ex:hasFruit rdf:parseType="Collection"></ex:hasFruit>
  </rdf:Description>
</rdf:RDF>`);
        return expect(array)
          .toEqualRdfQuadArray([
            quad('http://example.org/basket', 'http://example.org/stuff/1.0/hasFruit',
              'http://www.w3.org/1999/02/22-rdf-syntax-ns#nil'),
          ]);
      });

      // 2.16
      it('zero properties in a self-closing tag in a rdf:parseType="Collection" to a linked list', async () => {
        const array = await parse(parser, `<?xml version="1.0"?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
         xmlns:ex="http://example.org/stuff/1.0/">
  <rdf:Description rdf:about="http://example.org/basket">
    <ex:hasFruit rdf:parseType="Collection" />
  </rdf:Description>
</rdf:RDF>`);
        return expect(array)
          .toEqualRdfQuadArray([
            quad('http://example.org/basket', 'http://example.org/stuff/1.0/hasFruit',
              'http://www.w3.org/1999/02/22-rdf-syntax-ns#nil'),
          ]);
      });

      // 2.17
      it('rdf:ID on a property with a literal to a reified statement', async () => {
        const array = await parse(parser, `<?xml version="1.0"?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
         xmlns:ex="http://example.org/stuff/1.0/"
         xml:base="http://example.org/triples/">
  <rdf:Description rdf:about="http://example.org/">
    <ex:prop rdf:ID="triple1">blah</ex:prop>
  </rdf:Description>
</rdf:RDF>`);
        return expect(array)
          .toEqualRdfQuadArray([
            quad('http://example.org/', 'http://example.org/stuff/1.0/prop', '"blah"'),
            quad('http://example.org/triples/#triple1', 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type',
              'http://www.w3.org/1999/02/22-rdf-syntax-ns#Statement'),
            quad('http://example.org/triples/#triple1', 'http://www.w3.org/1999/02/22-rdf-syntax-ns#subject',
              'http://example.org/'),
            quad('http://example.org/triples/#triple1', 'http://www.w3.org/1999/02/22-rdf-syntax-ns#predicate',
              'http://example.org/stuff/1.0/prop'),
            quad('http://example.org/triples/#triple1', 'http://www.w3.org/1999/02/22-rdf-syntax-ns#object',
              '"blah"'),
          ]);
      });

      // 2.17
      it('rdf:ID on a property with a nested node to a reified statement', async () => {
        const array = await parse(parser, `<?xml version="1.0"?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
         xmlns:ex="http://example.org/stuff/1.0/"
         xml:base="http://example.org/triples/">
  <rdf:Description rdf:about="http://example.org/">
    <ex:prop rdf:ID="triple1">
      <rdf:Description rdf:about="http://example.org/2" />
    </ex:prop>
  </rdf:Description>
</rdf:RDF>`);
        return expect(array)
          .toEqualRdfQuadArray([
            quad('http://example.org/', 'http://example.org/stuff/1.0/prop', 'http://example.org/2'),
            quad('http://example.org/triples/#triple1', 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type',
              'http://www.w3.org/1999/02/22-rdf-syntax-ns#Statement'),
            quad('http://example.org/triples/#triple1', 'http://www.w3.org/1999/02/22-rdf-syntax-ns#subject',
              'http://example.org/'),
            quad('http://example.org/triples/#triple1', 'http://www.w3.org/1999/02/22-rdf-syntax-ns#predicate',
              'http://example.org/stuff/1.0/prop'),
            quad('http://example.org/triples/#triple1', 'http://www.w3.org/1999/02/22-rdf-syntax-ns#object',
              'http://example.org/2'),
          ]);
      });

      it('an anonymous property with properties with inner rdf:Description', async () => {
        const array = await parse(parser, `<?xml version="1.0"?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
         xmlns:ex="http://example.org/stuff/1.0/"
         xml:base="http://example.org/triples/">
  <rdf:Description rdf:about="http://example.org/">
    <ex:prop1 ex:prop2="abc">
      <rdf:Description rdf:about="http://example.org/2" />
    </ex:prop>
  </rdf:Description>
</rdf:RDF>`);
        return expect(array)
          .toEqualRdfQuadArray([
            quad('http://example.org/', 'http://example.org/stuff/1.0/prop1', 'http://example.org/2'),
            quad('http://example.org/2', 'http://example.org/stuff/1.0/prop2', '"abc"'),
          ]);
      });

      // 2.17
      it('rdf:ID on a property with parseType=\'Resource\' to a reified statement', async () => {
        const array = await parse(parser, `<?xml version="1.0"?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
         xmlns:ex="http://example.org/stuff/1.0/"
         xml:base="http://example.org/triples/">
  <rdf:Description rdf:about="http://example.org/">
    <ex:prop rdf:ID="triple1" rdf:parseType='Resource'>
      <ex:prop2>abc</ex:prop2>
    </ex:prop>
  </rdf:Description>
</rdf:RDF>`);
        expect(array[0].object).toBe(array[4].object);
        expect(array[0].object).toBe(array[5].subject);
        return expect(array)
          .toEqualRdfQuadArray([
            quad('http://example.org/', 'http://example.org/stuff/1.0/prop', '_:b'),
            quad('http://example.org/triples/#triple1', 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type',
              'http://www.w3.org/1999/02/22-rdf-syntax-ns#Statement'),
            quad('http://example.org/triples/#triple1', 'http://www.w3.org/1999/02/22-rdf-syntax-ns#subject',
              'http://example.org/'),
            quad('http://example.org/triples/#triple1', 'http://www.w3.org/1999/02/22-rdf-syntax-ns#predicate',
              'http://example.org/stuff/1.0/prop'),
            quad('http://example.org/triples/#triple1', 'http://www.w3.org/1999/02/22-rdf-syntax-ns#object',
              '_:b'),
            quad('_:b', 'http://example.org/stuff/1.0/prop2', '"abc"'),
          ]);
      });

      // 2.17
      it('Identifical rdf:ID\'s are allowed if they refer to different resources', async () => {
        const array = await parse(parser, `<?xml version="1.0"?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
         xmlns:ex="http://example.org/"
         xml:base="http://example.org/triples">
  <rdf:Description xml:base="http://example.org/dir/file"
                rdf:ID="frag" ex:value="v" />
  <rdf:Description rdf:ID="frag" ex:value="v" />
</rdf:RDF>`);
        return expect(array)
          .toEqualRdfQuadArray([
            quad('http://example.org/dir/file#frag', 'http://example.org/value', '"v"'),
            quad('http://example.org/triples#frag', 'http://example.org/value', '"v"'),
          ]);
      });

      // 2.8
      it('property element values with rdf:parseType="Literal" to literals', async () => {
        const array = await parse(parser, `<?xml version="1.0"?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
         xmlns:ex="http://example.org/stuff/1.0/">
  <rdf:Description rdf:about="http://example.org/item01">
    <ex:prop rdf:parseType="Literal">
      <a:Box required="true" xmlns:a="http://example.org/a#">
        <a:widget size="10" />
        <a:grommit id="23">abc</a:grommit>
      </a:Box>
    </ex:prop>
  </rdf:Description>
</rdf:RDF>`);
        return expect(array)
          .toEqualRdfQuadArray([
            quad('http://example.org/item01', 'http://example.org/stuff/1.0/prop',
              '"\n      <a:Box required="true" xmlns:a="http://example.org/a#">\n' +
              '        <a:widget size="10"></a:widget>\n' +
              '        <a:grommit id="23">abc</a:grommit>\n' +
              '      </a:Box>\n' +
              '    "^^http://www.w3.org/1999/02/22-rdf-syntax-ns#XMLLiteral'),
          ]);
      });

      // 2.8
      it('property element values with rdf:parseType="Literal" to literals without prefixes', async () => {
        const array = await parse(parser, `<?xml version="1.0"?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
         xmlns:ex="http://example.org/stuff/1.0/">
  <rdf:Description rdf:about="http://example.org/item01">
    <ex:prop rdf:parseType="Literal">
      <Box></Box>
    </ex:prop>
  </rdf:Description>
</rdf:RDF>`);
        return expect(array)
          .toEqualRdfQuadArray([
            quad('http://example.org/item01', 'http://example.org/stuff/1.0/prop',
              '"\n      <Box></Box>\n' +
              '    "^^http://www.w3.org/1999/02/22-rdf-syntax-ns#XMLLiteral'),
          ]);
      });

      it('and ignore unrecognized attributes on nodes', async () => {
        const array = await parse(parser, `<?xml version="1.0"?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
         xmlns:ex="http://example.org/schema#">
  <rdf:Description rdf:about="http://example.org/thing" xmlnewthing="anything">
    <ex:prop1>stuff</ex:prop1>
  </rdf:Description>
</rdf:RDF>`);
        return expect(array)
          .toEqualRdfQuadArray([
            quad('http://example.org/thing', 'http://example.org/schema#prop1', '"stuff"'),
          ]);
      });

      it('and ignore unrecognized attributes on properties', async () => {
        const array = await parse(parser, `<?xml version="1.0"?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
         xmlns:ex="http://example.org/schema#">
  <rdf:Description rdf:about="http://example.org/thing">
    <ex:prop1 xmlnewthing="anything">stuff</ex:prop1>
  </rdf:Description>
</rdf:RDF>`);
        return expect(array)
          .toEqualRdfQuadArray([
            quad('http://example.org/thing', 'http://example.org/schema#prop1', '"stuff"'),
          ]);
      });

      it('and apply the language on node properties', async () => {
        const array = await parse(parser, `<?xml version="1.0"?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
         xmlns:eg="http://example.org/schema#">
  <rdf:Description rdf:about="http://example.org/node"
                   xml:lang="fr"
                   eg:property="chat" />
</rdf:RDF>`);
        return expect(array)
          .toEqualRdfQuadArray([
            quad('http://example.org/node', 'http://example.org/schema#property', '"chat"@fr'),
          ]);
      });

      it('and allow rdf:ID to be used with other attributes', async () => {
        const array = await parse(parser, `<?xml version="1.0"?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
         xmlns:eg="http://example.org/"
         xml:base="http://example.org/triples">
  <rdf:Description>
    <eg:prop1 rdf:ID="reify" eg:prop2="val"></eg:prop1>
  </rdf:Description>
</rdf:RDF>`);
        return expect(array)
          .toEqualRdfQuadArray([
            quad('_:b0', 'http://example.org/prop1', '_:b1'),
            quad('http://example.org/triples#reify', 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type',
              'http://www.w3.org/1999/02/22-rdf-syntax-ns#Statement'),
            quad('http://example.org/triples#reify', 'http://www.w3.org/1999/02/22-rdf-syntax-ns#subject', '_:b0'),
            quad('http://example.org/triples#reify', 'http://www.w3.org/1999/02/22-rdf-syntax-ns#predicate',
              'http://example.org/prop1'),
            quad('http://example.org/triples#reify', 'http://www.w3.org/1999/02/22-rdf-syntax-ns#object', '_:b1'),
            quad('_:b1', 'http://example.org/prop2', '"val"'),
          ]);
      });

      it('and allow rdf:ID to be used with other attributes (in reverse order)', async () => {
        const array = await parse(parser, `<?xml version="1.0"?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
         xmlns:eg="http://example.org/"
         xml:base="http://example.org/triples">
  <rdf:Description>
    <eg:prop1 eg:prop2="val" rdf:ID="reify"></eg:prop1>
  </rdf:Description>
</rdf:RDF>`);
        return expect(array)
          .toEqualRdfQuadArray([
            quad('_:b0', 'http://example.org/prop1', '_:b1'),
            quad('http://example.org/triples#reify', 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type',
              'http://www.w3.org/1999/02/22-rdf-syntax-ns#Statement'),
            quad('http://example.org/triples#reify', 'http://www.w3.org/1999/02/22-rdf-syntax-ns#subject', '_:b0'),
            quad('http://example.org/triples#reify', 'http://www.w3.org/1999/02/22-rdf-syntax-ns#predicate',
              'http://example.org/prop1'),
            quad('http://example.org/triples#reify', 'http://www.w3.org/1999/02/22-rdf-syntax-ns#object', '_:b1'),
            quad('_:b1', 'http://example.org/prop2', '"val"'),
          ]);
      });

      it('and allow rdf:resource to be used with other attributes', async () => {
        const array = await parse(parser, `<?xml version="1.0"?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
         xmlns:eg="http://example.org/"
         xml:base="http://example.org/triples">
  <rdf:Description>
    <eg:prop1 rdf:resource="http://example.org/object#uriRef" eg:prop2="val"></eg:prop1>
  </rdf:Description>
</rdf:RDF>`);
        return expect(array)
          .toEqualRdfQuadArray([
            quad('_:b', 'http://example.org/prop1', 'http://example.org/object#uriRef'),
            quad('http://example.org/object#uriRef', 'http://example.org/prop2', '"val"'),
          ]);
      });

      it('rdf:type on node elements should be seen as a named node instead of literal', async () => {
        const array = await parse(parser, `<?xml version="1.0"?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
  <rdf:Description rdf:about="http://example.org/resource/"
                   rdf:type="http://example.org/class/"/>
</rdf:RDF>`);
        return expect(array)
          .toEqualRdfQuadArray([
            quad('http://example.org/resource/', 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type',
              'http://example.org/class/'),
          ]);
      });

      it('a missing rdf:RDF', async () => {
        const array = await parse(parser, `<?xml version="1.0"?>
<Book xmlns="http://example.org/terms#">
  <title>Dogs in Hats</title>
</Book>`);
        return expect(array)
          .toEqualRdfQuadArray([
            quad('_:b', 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type',
              'http://example.org/terms#Book'),
            quad('_:b', 'http://example.org/terms#title',
              '"Dogs in Hats"'),
          ]);
      });
    });

    describe('streaming-wise', () => {
      const streamParser = new RdfXmlParser();

      it('should not emit on the empty string', () => {
        streamParser.write('');
        expect(streamParser.read(1)).toBeFalsy();
      });

      it('should not emit after the XML start tag', () => {
        streamParser.write('<?xml version="1.0"?>');
        expect(streamParser.read(1)).toBeFalsy();
      });

      it('should not emit after the RDF start tag', () => {
        streamParser.write(`<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
         xmlns:ex="http://example.org/stuff/1.0/"
         xml:base="http://example.org/triples/">`);
        expect(streamParser.read(1)).toBeFalsy();
      });

      it('should not emit after open an rdf:Description tag', () => {
        streamParser.write(`<rdf:Description `);
        expect(streamParser.read(1)).toBeFalsy();
      });

      it('should not emit after a property attribute', () => {
        streamParser.write(`ex:title1="Title1" `);
        expect(streamParser.read(1)).toBeFalsy();
      });

      it('should not emit after an rdf:about attribute', () => {
        streamParser.write(`rdf:about="http://www.w3.org/TR/rdf-syntax-grammar" `);
        expect(streamParser.read(1)).toBeFalsy();
      });

      it('should not emit after another a property attribute', () => {
        streamParser.write(`ex:title2="Title2"`);
        expect(streamParser.read(1)).toBeFalsy();
      });

      it('should emit 2 triples after closing the rdf:Description tag', () => {
        streamParser.write(`>`);
        expect(streamParser.read(1)).toEqualRdfQuad(quad('http://www.w3.org/TR/rdf-syntax-grammar',
          'http://example.org/stuff/1.0/title1', '"Title1"'));
        expect(streamParser.read(1)).toEqualRdfQuad(quad('http://www.w3.org/TR/rdf-syntax-grammar',
          'http://example.org/stuff/1.0/title2', '"Title2"'));
        expect(streamParser.read(1)).toBeFalsy();
      });

      it('should not emit after opening a property tag', () => {
        streamParser.write(`<ex:prop `);
        expect(streamParser.read(1)).toBeFalsy();
      });

      it('should not emit after setting the resource in a property tag', () => {
        streamParser.write(` rdf:resource="http://example.org/" `);
        expect(streamParser.read(1)).toBeFalsy();
      });

      it('should emit after closing the property tag', () => {
        streamParser.write(`/>`);
        expect(streamParser.read(1)).toEqualRdfQuad(quad('http://www.w3.org/TR/rdf-syntax-grammar',
          'http://example.org/stuff/1.0/prop', 'http://example.org/'));
        expect(streamParser.read(1)).toBeFalsy();
      });

      it('should not emit after closing the rdf:Description tag', () => {
        streamParser.write(`</rdf:Description>`);
        expect(streamParser.read(1)).toBeFalsy();
      });

      it('should not emit after closing the rdf:RDF tag', () => {
        streamParser.write(`</rdf:RDF>`);
        expect(streamParser.read(1)).toBeFalsy();
      });

      it('should be closed after finishing the stream', () => {
        streamParser.end();
        expect(streamParser.read(1)).toBeFalsy();
        expect(streamParser.writable).toBeFalsy();
      });
    });
  });
});

function parse(parser: RdfXmlParser, input: string): Promise<RDF.Quad[]> {
  return arrayifyStream(streamifyString(input).pipe(parser));
}
