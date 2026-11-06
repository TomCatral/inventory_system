const assert = require('node:assert/strict');
const { test } = require('node:test');
const { of, throwError } = require('rxjs');
const { SsoService } = require('../dist/auth/sso.service');

function createService({
  projectKey = 'test-project-key',
  response = {
    status: 200,
    data: { access_token: 'test-access-token', token_type: 'Bearer' },
  },
  requestError,
} = {}) {
  const requests = [];
  const http = {
    request: (config) => {
      requests.push(config);
      return requestError
        ? throwError(() => requestError)
        : of({ ...response, headers: {}, config: {} });
    },
  };
  const config = {
    get: (key) => {
      if (key === 'PGC_SSO_URL') return 'https://sso.cagayan.gov.ph';
      if (key === 'PGC_SSO_PROJECT_KEY') return projectKey;
      return undefined;
    },
  };

  return { service: new SsoService(http, config), requests };
}

test('login sends credentials and the project key to PGC SSO', async () => {
  const { service, requests } = createService();

  const result = await service.login('test-user', 'test-password');

  assert.deepEqual(result, {
    access_token: 'test-access-token',
    token_type: 'Bearer',
  });
  assert.equal(requests[0].url, 'https://sso.cagayan.gov.ph/api/auth/login');
  assert.deepEqual(requests[0].data, {
    username: 'test-user',
    password: 'test-password',
  });
  assert.equal(requests[0].headers['X-PGC-Project-Key'], 'test-project-key');
});

test('login rejects invalid credentials', async () => {
  const { service } = createService({
    response: { status: 401, data: { message: 'Invalid credentials.' } },
  });

  await assert.rejects(service.login('test-user', 'wrong-password'), (error) => {
    assert.equal(error.getStatus(), 401);
    return true;
  });
});

test('token validation forwards the bearer token and returns the SSO user', async () => {
  const user = { emp_no: '000000001', username: 'test-user' };
  const { service, requests } = createService({
    response: { status: 200, data: { authenticated: true, user } },
  });

  assert.deepEqual(
    await service.validateToken('Bearer test-access-token'),
    user,
  );
  assert.equal(requests[0].url, 'https://sso.cagayan.gov.ph/api/auth/validate');
  assert.equal(requests[0].headers.Authorization, 'Bearer test-access-token');
});

test('missing project key fails explicitly before making an SSO request', async () => {
  const { service, requests } = createService({ projectKey: '' });

  await assert.rejects(service.login('test-user', 'test-password'), (error) => {
    assert.equal(error.getStatus(), 500);
    assert.match(error.message, /project key is not configured/i);
    return true;
  });
  assert.equal(requests.length, 0);
});

test('SSO connection failures return a service-unavailable error', async () => {
  const { service } = createService({
    requestError: Object.assign(new Error('connection refused'), {
      isAxiosError: true,
    }),
  });

  await assert.rejects(
    service.login('test-user', 'test-password'),
    (error) => {
      assert.equal(error.getStatus(), 503);
      return true;
    },
  );
});
