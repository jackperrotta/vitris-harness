import {test} from 'node:test';
import assert from 'node:assert/strict';
import {browserVerificationTimeoutMs,productionPreflightTimeoutMs} from './agent/browser-timeout.ts';

test('full release verification defaults to one hour with time to seal the child report',()=>{
  assert.equal(browserVerificationTimeoutMs({}),3_600_000);
  assert.equal(productionPreflightTimeoutMs({}),3_660_000);
});
test('an explicit browser timeout is respected by both nested release processes',()=>{
  const env={VITRIS_BROWSER_TIMEOUT_MS:'7200000'};
  assert.equal(browserVerificationTimeoutMs(env),7_200_000);
  assert.equal(productionPreflightTimeoutMs(env),7_260_000);
});
test('invalid limits cannot silently disable the subprocess timeout',()=>{
  for(const value of ['0','-1','999','1000.5','NaN','Infinity','tomorrow','86400001']) {
    assert.throws(()=>browserVerificationTimeoutMs({VITRIS_BROWSER_TIMEOUT_MS:value}),/VITRIS_BROWSER_TIMEOUT_MS/);
  }
  assert.equal(browserVerificationTimeoutMs({VITRIS_BROWSER_TIMEOUT_MS:'1000'}),1000);
});
