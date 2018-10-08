import * as RDF from "rdf-js";
import {createStream, SAXStream, Tag} from "sax";
import {Transform, TransformCallback} from "stream";

export class RdfXmlParser extends Transform {

  public static readonly MIME_TYPE = 'application/rdf+xml';

  public static readonly RDF = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#';
  public static readonly XML = 'http://www.w3.org/XML/1998/namespace';
  public static readonly XMLNS = 'http://www.w3.org/2000/xmlns/';
  public static readonly DEFAULT_NS = {
    xml: RdfXmlParser.XML,
  };
  public static readonly FORBIDDEN_NODE_ELEMENTS = [
    'RDF',
    'ID',
    'about',
    'bagID',
    'parseType',
    'resource',
    'nodeID',
    'li',
    'aboutEach',
    'aboutEachPrefix',
  ];
  public static readonly FORBIDDEN_PROPERTY_ELEMENTS = [
    'Description',
    'RDF',
    'ID',
    'about',
    'bagID',
    'parseType',
    'resource',
    'nodeID',
    'aboutEach',
    'aboutEachPrefix',
  ];
  // tslint:disable-next-line:max-line-length
  public static readonly NCNAME_MATCHER = /^([A-Za-z\xC0-\xD6\xD8-\xF6\u{F8}-\u{2FF}\u{370}-\u{37D}\u{37F}-\u{1FFF}\u{200C}-\u{200D}\u{2070}-\u{218F}\u{2C00}-\u{2FEF}\u{3001}-\u{D7FF}\u{F900}-\u{FDCF}\u{FDF0}-\u{FFFD}\u{10000}-\u{EFFFF}_])([A-Za-z\xC0-\xD6\xD8-\xF6\u{F8}-\u{2FF}\u{370}-\u{37D}\u{37F}-\u{1FFF}\u{200C}-\u{200D}\u{2070}-\u{218F}\u{2C00}-\u{2FEF}\u{3001}-\u{D7FF}\u{F900}-\u{FDCF}\u{FDF0}-\u{FFFD}\u{10000}-\u{EFFFF}_\-.0-9#xB7\u{0300}-\u{036F}\u{203F}-\u{2040}])*$/u;

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

    this.saxStream = createStream(this.strict, { xmlns: false, position: false });

    // Workaround for an issue in SAX where non-strict mode either lower- or upper-cases all tags.
    if (!this.strict) {
      (<any> this.saxStream)._parser.looseCase = 'toString';
    }

    this.attachSaxListeners();
  }

  /**
   * Parse the namespace of the given tag,
   * and take into account the namespace of the parent tag that was already parsed.
   * @param {Tag} tag A tag to parse the namespace from.
   * @param {IActiveTag} parentTag The parent tag, or null if this tag is the root.
   * @return {{[p: string]: string}[]} An array of namespaces,
   *                                   where the last ones have a priority over the first ones.
   */
  public static parseNamespace(tag: Tag, parentTag?: IActiveTag): {[prefix: string]: string}[] {
    const thisNs: {[prefix: string]: string} = {};
    let hasNs: boolean = false;
    for (const attributeKey in tag.attributes) {
      if (attributeKey.startsWith('xmlns')) {
        if (attributeKey.length === 5) {
          // Set default namespace
          hasNs = true;
          thisNs[''] = tag.attributes[attributeKey];
        } else if (attributeKey.charAt(5) === ':') {
          // Definition of a prefix
          hasNs = true;
          thisNs[attributeKey.substr(6)] = tag.attributes[attributeKey];
        }
      }
    }
    const parentNs = parentTag && parentTag.ns ? parentTag.ns : [RdfXmlParser.DEFAULT_NS];
    return hasNs ? parentNs.concat([thisNs]) : parentNs;
  }

  /**
   * Expand the given term value based on the given namespaces.
   * @param {string} term A term value.
   * @param {{[p: string]: string}[]} ns An array of namespaces,
   *                                     where the last ones have a priority over the first ones.
   * @return {IExpandedPrefix} An expanded prefix object.
   */
  public static expandPrefixedTerm(term: string, ns: { [key: string]: string }[]): IExpandedPrefix {
    const colonIndex: number = term.indexOf(':');
    let prefix: string;
    let local: string;
    if (colonIndex >= 0) {
      // Prefix is set
      prefix = term.substr(0, colonIndex);
      local = term.substr(colonIndex + 1);
    } else {
      // Prefix is not set, fallback to default namespace
      prefix = '';
      local = term;
    }

    let uri: string = null;
    let defaultNamespace: string = null;
    for (let i = ns.length - 1; i >= 0; i--) {
      const nsElement = ns[i][prefix];
      if (nsElement) {
        uri = nsElement;
        break;
      } else if (!defaultNamespace) {
        defaultNamespace = ns[i][''];
      }
    }

    if (!uri) {
      // Fallback to default namespace if no match was found
      uri = defaultNamespace || '';
    }
    return { prefix, local, uri };
  }

  public _transform(chunk: any, encoding: string, callback: TransformCallback) {
    this.saxStream.write(chunk, encoding);
    callback();
  }

  /**
   * Convert the given value to a IRI by taking into account the baseIRI.
   *
   * This will follow the RDF/XML spec for converting values with baseIRIs to a IRI.
   *
   * @param {string} value The value to convert to an IRI.
   * @param {IActiveTag} activeTag The active tag.
   * @return {NamedNode} an IRI.
   */
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
      // Always true: baseSlashAfterColonPos < 0
      // If something other than a '/' follows the ':', append the value after a '/',
      // otherwise, prefix the value with only the baseIRI scheme.
      if (baseIRI.length > baseColonPos + 1) {
        return this.dataFactory.namedNode(baseIRI + '/' + value);
      } else {
        return this.dataFactory.namedNode(baseIRIScheme + value);
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

  /**
   * Validate the given value as an NCName: https://www.w3.org/TR/xml-names/#NT-NCName
   * If it is invalid, an error will be emitted.
   * @param {string} value A value.
   */
  public validateNcname(value: string) {
    // Validate term as an NCName: https://www.w3.org/TR/xml-names/#NT-NCName
    if (!RdfXmlParser.NCNAME_MATCHER.test(value)) {
      this.emit('error', new Error(`Not a valid NCName: ${value}`));
    }
  }

  protected attachSaxListeners() {
    this.saxStream.on('error', (error) => this.emit('error', error));
    this.saxStream.on('opentag', this.onTag.bind(this));
    this.saxStream.on('text', this.onText.bind(this));
    this.saxStream.on('closetag', this.onCloseTag.bind(this));
    this.saxStream.on('doctype', this.onDoctype.bind(this));
  }

  /**
   * Handle the given tag.
   * @param {QualifiedTag} tag A SAX tag.
   */
  protected onTag(tag: Tag) {
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
      const tagName: string = tag.name;
      let attributes: string = '';
      for (const attributeKey in tag.attributes) {
        attributes += ` ${attributeKey}="${tag.attributes[attributeKey]}"`;
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
    activeTag.ns = RdfXmlParser.parseNamespace(tag, parentTag);

    if (currentParseType === ParseType.RESOURCE) {
      this.onTagResource(tag, activeTag, parentTag, !parentTag);
    } else { // currentParseType === ParseType.PROPERTY
      this.onTagProperty(tag, activeTag, parentTag);
    }
  }

  /**
   * Handle the given node element in resource-mode.
   * @param {QualifiedTag} tag A SAX tag.
   * @param {IActiveTag} activeTag The currently active tag.
   * @param {IActiveTag} parentTag The parent tag or null.
   * @param {boolean} rootTag If we are currently processing the root tag.
   */
  protected onTagResource(tag: Tag, activeTag: IActiveTag, parentTag: IActiveTag, rootTag: boolean) {
    const tagExpanded: IExpandedPrefix = RdfXmlParser.expandPrefixedTerm(tag.name, activeTag.ns);

    activeTag.childrenParseType = ParseType.PROPERTY;
    // Assume that the current node is a _typed_ node (2.13), unless we find an rdf:Description as node name
    let typedNode: boolean = true;
    if (tagExpanded.uri === RdfXmlParser.RDF) {
      // Check forbidden property element names
      if (!rootTag && RdfXmlParser.FORBIDDEN_NODE_ELEMENTS.indexOf(tagExpanded.local) >= 0) {
        this.emit('error', new Error(`Illegal node element name: ${tagExpanded.local}`));
      }

      switch (tagExpanded.local) {
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
    let explicitType: string = null;
    for (const attributeKey in tag.attributes) {
      const attributeValue: string = tag.attributes[attributeKey];
      const attributeKeyExpanded: IExpandedPrefix = RdfXmlParser.expandPrefixedTerm(attributeKey, activeTag.ns);
      if (parentTag && attributeKeyExpanded.uri === RdfXmlParser.RDF) {
        switch (attributeKeyExpanded.local) {
        case 'about':
          if (activeSubjectValue) {
            this.emit('error', new Error(`Only one of rdf:about, rdf:nodeID and rdf:ID can be present, \
while ${attributeValue} and ${activeSubjectValue} where found.`));
          }
          activeSubjectValue = attributeValue;
          continue;
        case 'ID':
          if (activeSubjectValue) {
            this.emit('error', new Error(`Only one of rdf:about, rdf:nodeID and rdf:ID can be present, \
while ${attributeValue} and ${activeSubjectValue} where found.`));
          }
          this.validateNcname(attributeValue);
          activeSubjectValue = '#' + attributeValue;
          claimSubjectNodeId = true;
          continue;
        case 'nodeID':
          if (activeSubjectValue) {
            this.emit('error', new Error(`Only one of rdf:about, rdf:nodeID and rdf:ID can be present, \
while ${attributeValue} and ${activeSubjectValue} where found.`));
          }
          this.validateNcname(attributeValue);
          activeSubjectValue = attributeValue;
          subjectValueBlank = true;
          continue;
        case 'bagID':
          this.emit('error', new Error(`rdf:bagID is not supported.`));
          continue;
        case 'type':
          // Emit the rdf:type later as named node instead of the default literal
          explicitType = attributeValue;
          continue;
        case 'aboutEach':
          this.emit('error', new Error(`rdf:aboutEach is not supported.`));
          continue;
        case 'aboutEachPrefix':
          this.emit('error', new Error(`rdf:aboutEachPrefix is not supported.`));
          continue;
        case 'li':
          this.emit('error', new Error(`rdf:li on node elements are not supported.`));
          continue;
        }
      } else if (attributeKeyExpanded.uri === RdfXmlParser.XML) {
        if (attributeKeyExpanded.local === 'lang') {
          activeTag.language = attributeValue === '' ? null : attributeValue.toLowerCase();
          continue;
        } else if (attributeKeyExpanded.local === 'base') {
          activeTag.baseIRI = attributeValue;
          continue;
        }
      }

      // Interpret attributes at this point as properties on this node,
      // but we ignore attributes that have no prefix or known expanded URI
      if (attributeKeyExpanded.prefix !== 'xml' && attributeKeyExpanded.uri) {
        predicates.push(this.dataFactory.namedNode(attributeKeyExpanded.uri + attributeKeyExpanded.local));
        objects.push(attributeValue);
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

    // Force the creation of a subject if it doesn't exist yet
    if (!activeTag.subject) {
      activeTag.subject = this.dataFactory.blankNode();
    }

    // Emit the type if we're at a typed node
    if (typedNode) {
      const type: RDF.NamedNode = this.dataFactory.namedNode(tagExpanded.uri + tagExpanded.local);
      this.emitTriple(activeTag.subject, this.dataFactory.namedNode(RdfXmlParser.RDF + 'type'),
        type, parentTag ? parentTag.reifiedStatementId : null);
    }

    if (parentTag) {
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
      // Emit the rdf:type as named node instead of literal
      if (explicitType) {
        this.emitTriple(activeTag.subject, this.dataFactory.namedNode(RdfXmlParser.RDF + 'type'),
          this.dataFactory.namedNode(explicitType), null);
      }
    }
  }

  /**
   * Handle the given property element in property-mode.
   * @param {QualifiedTag} tag A SAX tag.
   * @param {IActiveTag} activeTag The currently active tag.
   * @param {IActiveTag} parentTag The parent tag or null.
   */
  protected onTagProperty(tag: Tag, activeTag: IActiveTag, parentTag: IActiveTag) {
    const tagExpanded: IExpandedPrefix = RdfXmlParser.expandPrefixedTerm(tag.name, activeTag.ns);

    activeTag.childrenParseType = ParseType.RESOURCE;
    activeTag.subject = parentTag.subject; // Inherit parent subject
    if (tagExpanded.uri === RdfXmlParser.RDF && tagExpanded.local === 'li') {
      // Convert rdf:li to rdf:_x
      if (!parentTag.listItemCounter) {
        parentTag.listItemCounter = 1;
      }
      activeTag.predicate = this.dataFactory.namedNode(tagExpanded.uri + '_' + parentTag.listItemCounter++);
    } else {
      activeTag.predicate = this.dataFactory.namedNode(tagExpanded.uri + tagExpanded.local);
    }

    // Check forbidden property element names
    if (tagExpanded.uri === RdfXmlParser.RDF
      && RdfXmlParser.FORBIDDEN_PROPERTY_ELEMENTS.indexOf(tagExpanded.local) >= 0) {
      this.emit('error', new Error(`Illegal property element name: ${tagExpanded.local}`));
    }

    activeTag.predicateSubPredicates = [];
    activeTag.predicateSubObjects = [];
    let parseType: boolean = false;
    let attributedProperty: boolean = false;

    // Collect all attributes as triples
    // Assign subject value only after all attributes have been processed, because baseIRI may change the final val
    let activeSubSubjectValue: string = null;
    let subSubjectValueBlank: boolean = true;
    const predicates: RDF.Term[] = [];
    const objects: RDF.Term[] = [];
    for (const propertyAttributeKey in tag.attributes) {
      const propertyAttributeValue: string = tag.attributes[propertyAttributeKey];
      const propertyAttributeKeyExpanded: IExpandedPrefix = RdfXmlParser
        .expandPrefixedTerm(propertyAttributeKey, activeTag.ns);
      if (propertyAttributeKeyExpanded.uri === RdfXmlParser.RDF) {
        switch (propertyAttributeKeyExpanded.local) {
        case 'resource':
          if (activeSubSubjectValue) {
            this.emit('error', new Error(`Found both rdf:resource (${propertyAttributeValue
              }) and rdf:nodeID (${activeSubSubjectValue}).`));
          }
          if (parseType) {
            this.emit('error',
              new Error(`rdf:parseType is not allowed on property elements with rdf:resource (${
                propertyAttributeValue})`));
          }
          activeTag.hadChildren = true;
          activeSubSubjectValue = propertyAttributeValue;
          subSubjectValueBlank = false;
          continue;
        case 'datatype':
          if (attributedProperty) {
            this.emit('error', new Error(
              `Found both non-rdf:* property attributes and rdf:datatype (${propertyAttributeValue}).`));
          }
          if (parseType) {
            this.emit('error',
              new Error(`rdf:parseType is not allowed on property elements with rdf:datatype (${
                propertyAttributeValue})`));
          }
          activeTag.datatype = this.valueToUri(propertyAttributeValue, activeTag);
          continue;
        case 'nodeID':
          if (attributedProperty) {
            this.emit('error', new Error(
              `Found both non-rdf:* property attributes and rdf:nodeID (${propertyAttributeValue}).`));
          }
          if (activeTag.hadChildren) {
            this.emit('error', new Error(
              `Found both rdf:resource and rdf:nodeID (${propertyAttributeValue}).`));
          }
          if (parseType) {
            this.emit('error',
              new Error(`rdf:parseType is not allowed on property elements with rdf:nodeID (${
                propertyAttributeValue})`));
          }
          this.validateNcname(propertyAttributeValue);
          activeTag.hadChildren = true;
          activeSubSubjectValue = propertyAttributeValue;
          subSubjectValueBlank = true;
          continue;
        case 'bagID':
          this.emit('error', new Error(`rdf:bagID is not supported.`));
          continue;
        case 'parseType':
          // Validation
          if (attributedProperty) {
            this.emit('error', new Error(
              `rdf:parseType is not allowed when non-rdf:* property attributes are present`));
          }
          if (activeTag.datatype) {
            this.emit('error',
              new Error(`rdf:parseType is not allowed on property elements with rdf:datatype (${
                activeTag.datatype.value})`));
          }
          if (activeSubSubjectValue) {
            this.emit('error', new Error(
              `rdf:parseType is not allowed on property elements with rdf:nodeID or rdf:resource (${
                activeSubSubjectValue})`));
          }

          if (propertyAttributeValue === 'Resource') {
            parseType = true;
            activeTag.childrenParseType = ParseType.PROPERTY;

            // Turn this property element into a node element
            const nestedBNode: RDF.BlankNode = this.dataFactory.blankNode();
            this.emitTriple(activeTag.subject, activeTag.predicate, nestedBNode, activeTag.reifiedStatementId);
            activeTag.subject = nestedBNode;
            activeTag.predicate = null;
          } else if (propertyAttributeValue === 'Collection') {
            parseType = true;
            // Interpret children as being part of an rdf:List
            activeTag.hadChildren = true;
            activeTag.childrenCollectionSubject = activeTag.subject;
            activeTag.childrenCollectionPredicate = activeTag.predicate;
            subSubjectValueBlank = false;
          } else if (propertyAttributeValue === 'Literal') {
            parseType = true;
            // Interpret children as being part of a literal string
            activeTag.childrenTagsToString = true;
            activeTag.childrenStringTags = [];
          }
          continue;
        case 'ID':
          this.validateNcname(propertyAttributeValue);
          activeTag.reifiedStatementId = this.valueToUri('#' + propertyAttributeValue, activeTag);
          this.claimNodeId(activeTag.reifiedStatementId);
          continue;
        }
      } else if (propertyAttributeKeyExpanded.uri === RdfXmlParser.XML
        && propertyAttributeKeyExpanded.local === 'lang') {
        activeTag.language = propertyAttributeValue === ''
          ? null : propertyAttributeValue.toLowerCase();
        continue;
      }

      // Interpret attributes at this point as properties via implicit blank nodes on the property,
      // but we ignore attributes that have no prefix or known expanded URI
      if (propertyAttributeKeyExpanded.prefix !== 'xml' && propertyAttributeKeyExpanded.uri) {
        if (parseType || activeTag.datatype) {
          this.emit('error', new Error(
            `Found illegal rdf:* properties on property element with attribute: ${propertyAttributeValue}`));
        }
        activeTag.hadChildren = true;
        attributedProperty = true;
        predicates.push(this.dataFactory.namedNode(
          propertyAttributeKeyExpanded.uri + propertyAttributeKeyExpanded.local));
        objects.push(this.dataFactory.literal(propertyAttributeValue,
          activeTag.datatype || activeTag.language));
      }
    }

    // Create the subject value _after_ all attributes have been processed
    if (activeSubSubjectValue !== null) {
      const subjectParent: RDF.Term = activeTag.subject;
      activeTag.subject = subSubjectValueBlank
        ? this.dataFactory.blankNode(activeSubSubjectValue) : this.valueToUri(activeSubSubjectValue, activeTag);
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

  /**
   * Emit the given triple to the stream.
   * @param {Term} subject A subject term.
   * @param {Term} predicate A predicate term.
   * @param {Term} object An object term.
   * @param {Term} statementId An optional resource that identifies the triple.
   *                           If truthy, then the given triple will also be emitted reified.
   */
  protected emitTriple(subject: RDF.Term, predicate: RDF.Term, object: RDF.Term, statementId?: RDF.Term) {
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

  /**
   * Handle the given text string.
   * @param {string} text A parsed text string.
   */
  protected onText(text: string) {
    const activeTag: IActiveTag = this.activeTagStack.length
      ? this.activeTagStack[this.activeTagStack.length - 1] : null;

    if (activeTag) {
      if (activeTag.childrenStringTags) {
        activeTag.childrenStringTags.push(text);
      } else if (activeTag.predicate) {
        activeTag.text = text;
      }
    }
  }

  /**
   * Handle the closing of the last tag.
   */
  protected onCloseTag() {
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
      if (!poppedTag.hadChildren && poppedTag.childrenParseType !== ParseType.PROPERTY) {
        // Property element contains text
        this.emitTriple(poppedTag.subject, poppedTag.predicate,
          this.dataFactory.literal(poppedTag.text || '', poppedTag.datatype || poppedTag.language),
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
  }

  /**
   * Fetch local DOCTYPE ENTITY's and make the parser recognise them.
   * @param {string} doctype The read doctype.
   */
  protected onDoctype(doctype: string) {
    doctype.replace(/<!ENTITY ([^ ]+) "([^"]+)">/g, (match, prefix, uri) => {
      (<any> this.saxStream)._parser.ENTITIES[prefix] = uri;
      return '';
    });
  }
}

export interface IExpandedPrefix {
  local: string;
  uri: string;
  prefix: string;
}

export interface IRdfXmlParserArgs {
  dataFactory?: RDF.DataFactory;
  baseIRI?: string;
  defaultGraph?: RDF.Term;
  strict?: boolean;
}

export interface IActiveTag {
  ns?: {[prefix: string]: string}[];
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
