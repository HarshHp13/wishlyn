import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const compile = path => ts.transpileModule(readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
const nodes = (value, result = []) => { if (Array.isArray(value)) value.forEach(item => nodes(item, result)); else if (value && typeof value === 'object' && value.props) { result.push(value); nodes(value.props.children, result); } return result; };
const text = value => Array.isArray(value) ? value.map(text).join('') : value && typeof value === 'object' ? text(value.props?.children) : value == null || typeof value === 'boolean' ? '' : String(value);

for (const admin of [false, true]) test(`${admin ? 'staff' : 'customer'} order actions wait for the fresh status after same-account verification`, async () => {
  const user = { id: admin ? 'staff-a' : 'customer-a', email: 'a@example.test', role: admin ? 'admin' : 'customer' };
  let auth = { status: 'authenticated', user };
  const listeners = new Set();
  const authClient = { getAuthState: () => auth, subscribeAuth: fn => { listeners.add(fn); return () => listeners.delete(fn); } };
  const changeAuth = next => { auth = next; listeners.forEach(fn => fn()); };
  const order = { id: `WISH-${'A'.repeat(32)}`, ownerId: 'customer-a', email: 'customer@example.test', items: [], shipping: { firstName: 'Synthetic', lastName: 'A', phone: '9876543210', address: '123 Test Road', city: 'Mumbai', state: 'Maharashtra', zipCode: '400001', country: 'India' }, status: admin ? 'paid' : 'pending_payment', paymentSetupState: 'idle', providerOrderId: null, providerPaymentId: null, fulfillmentStatus: 'unfulfilled', trackingCarrier: null, trackingNumber: null, trackingUrl: null, createdAt: '2026-10-29T00:00:00Z', expiresAt: '2026-10-30T00:00:00Z', subtotalPaise: 100, shippingPaise: 0, taxPaise: 0, totalPaise: 100 };
  let delayed = false, releaseRead, mutationCount = 0;
  const fetch = async (_url, options) => {
    if (options.method === 'POST') { mutationCount++; return Response.json({ viewerId: user.id, order }); }
    if (delayed) return new Promise(resolve => { releaseRead = () => resolve(Response.json({ viewerId: user.id, order: { ...order, status: 'paid', fulfillmentStatus: 'delivered' } })); });
    return Response.json({ viewerId: user.id, order });
  };
  const client = { exports: {}, require: () => authClient, fetch, AbortSignal, Error, JSON };
  vm.runInNewContext(compile('src/lib/commerce/client.ts'), client);
  const hooks = []; let cursor = 0, effects = [], dirty = false, tree;
  const react = {
    useState(initial) { const i = cursor++; if (!(i in hooks)) hooks[i] = { value: initial }; return [hooks[i].value, value => { hooks[i].value = typeof value === 'function' ? value(hooks[i].value) : value; dirty = true; }]; },
    useRef(initial) { const i = cursor++; if (!(i in hooks)) hooks[i] = { current: initial }; return hooks[i]; },
    useEffect(fn, deps) { const i = cursor++, prior = hooks[i]; if (!prior || deps.some((value, j) => value !== prior.deps[j])) { hooks[i] = { deps, cleanup: prior?.cleanup }; effects.push(() => { hooks[i].cleanup?.(); hooks[i].cleanup = fn(); }); } },
  };
  const jsx = (type, props) => ({ type, props: props || {} });
  const context = { exports: {}, AbortController, JSON, Error, window: { print() {} }, require: name => name === 'react' ? react : name === 'react/jsx-runtime' ? { jsx, jsxs: jsx, Fragment: 'fragment' } : name === '@/lib/authClient' ? authClient : name === '@/lib/commerce/client' ? client.exports : name === '@/lib/commerce-rules' ? { formatMoney: String } : { __esModule: true, default: {} } };
  vm.runInNewContext(compile('src/components/orders/OrdersView.tsx') + '\nexports.probe = AccountOrders;', context);
  const render = () => { cursor = 0; dirty = false; tree = context.exports.probe({ auth, admin, id: order.id }); const pending = effects; effects = []; pending.forEach(fn => fn()); };
  const flush = async () => { await new Promise(resolve => setImmediate(resolve)); while (dirty) render(); };
  render(); await flush();
  const oldAction = nodes(tree).find(node => node.type === 'button' && text(node) === (admin ? 'Mark processing' : 'Cancel unpaid order'));
  assert.ok(oldAction, 'initial status offers its legitimate action');
  changeAuth({ status: 'loading', user: null }); render(); await flush();
  delayed = true; changeAuth({ status: 'authenticated', user: { ...user } }); render(); await flush();
  assert.ok(releaseRead, 'fresh status read is pending');
  assert.match(text(tree), /Loading order details/);
  assert.doesNotMatch(text(tree), /Cancel unpaid order|Review and pay|Mark processing/);
  if (!admin) { await oldAction.props.onClick(); assert.equal(mutationCount, 0, 'retired control cannot dispatch across reverification'); }
  releaseRead(); await flush();
  assert.match(text(tree), /Payment confirmed/);
  assert.doesNotMatch(text(tree), /Cancel unpaid order|Review and pay|Mark processing/);
  assert.equal(mutationCount, 0);
});
