/**
 * Unit tests for the schema generation helpers in SchemaProviderService.
 *
 * `convertToJsonSchema` converts the CRD's OpenAPI schema to a JSON schema.
 * The resulting schema should mark Kubernetes fields such as `apiVersion`,
 * `kind` and `metadata` as required and recursively disable unknown
 * properties.
 *
 * `strictifySchema` is a utility that adds `additionalProperties: false` to
 * each object node in the schema tree. These tests verify that behaviour.
 */

import { expect } from '../helpers/setup';
import sinon from 'sinon';
import { installVsCodeMock } from '../helpers/vscodeMock';

let SchemaProviderService: typeof import('../../src/services/schemaProviderService').SchemaProviderService;

before(() => {
  const { restore } = installVsCodeMock();
  SchemaProviderService = require('../../src/services/schemaProviderService').SchemaProviderService;
  restore();
});

describe('SchemaProviderService convertToJsonSchema', () => {
  it('produces strict schema with required fields', () => {
    const k8sStub = { getCachedCrds: sinon.stub().returns([]) } as any;
    const service = new SchemaProviderService(k8sStub);

    const openAPISchema = {
      type: 'object',
      properties: {
        spec: {
          type: 'object',
          properties: {
            foo: { type: 'string' },
            nested: {
              type: 'object',
              properties: {
                bar: { type: 'number' }
              }
            }
          }
        },
        status: {
          type: 'object',
          properties: {
            state: { type: 'string' }
          }
        }
      }
    };

    const crd = {
      spec: {
        names: { kind: 'Foo' },
        versions: [
          {
            name: 'v1',
            served: true,
            storage: true,
            schema: { openAPIV3Schema: openAPISchema }
          }
        ]
      }
    };

    const result = (service as any).convertToJsonSchema(openAPISchema, 'Foo', crd);

    // Built-in resource fields should be mandatory
    expect(result.required).to.include.members(['apiVersion', 'kind', 'metadata']);
    // additionalProperties should be disabled on nested objects
    expect(result.properties.spec.additionalProperties).to.be.false;
    expect(result.properties.spec.properties.nested.additionalProperties).to.be.false;
  });

  it('strictifySchema recursively disables additionalProperties', () => {
    const k8sStub = { getCachedCrds: sinon.stub().returns([]) } as any;
    const service = new SchemaProviderService(k8sStub);

    const schema = {
      type: 'object',
      properties: {
        level1: {
          type: 'object',
          properties: { level2: { type: 'object', properties: { leaf: { type: 'string' } } } }
        }
      }
    };

    const strict = (service as any).strictifySchema(schema);

    // top level and all nested objects should not allow unknown fields
    expect(strict.additionalProperties).to.be.false;
    expect(strict.properties.level1.additionalProperties).to.be.false;
    expect(strict.properties.level1.properties.level2.additionalProperties).to.be.false;
  });
});
