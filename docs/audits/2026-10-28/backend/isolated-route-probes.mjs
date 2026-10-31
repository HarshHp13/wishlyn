// Audit harness only: no app imports execute outside the VM, no network, no .env reads.
// Run from repo root: node docs/audits/2026-10-28/backend/isolated-route-probes.mjs
import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import ts from 'typescript';

const root=process.cwd();
const fakeKey='ephemeral-audit-only-key';
const gatewayId='order_audit_fixture';
const paymentId='pay_audit_fixture';
const signature=crypto.createHmac('sha256',fakeKey).update(`${gatewayId}|${paymentId}`).digest('hex');
const variant={id:'fixture-v',product_id:'fixture-p',price:'100',stock:2,size:null,metal_type:'Gold',purity:'Test'};
const product={id:'fixture-p',title:'Fixture Product',images:[]};
const adminOnly=process.argv.includes('--admin-only');
const results=adminOnly ? JSON.parse(await fs.readFile('docs/audits/2026-10-28/backend/isolated-route-results.json','utf8')).filter(r=>r.route!=='src/app/api/admin/product/route.ts') : [];
function deps(state={}) {
  return {
    sql:()=>{},
    dbGetVariantsByIds:async ids=>[variant].filter(v=>ids.includes(v.id)),
    dbGetProductsByIds:async()=>[product],
    dbInsertOrder:async order=>{state.orders??=[];state.orders.push(order);return state.insertResult??true;},
    dbDecrementVariantStock:async(id,quantity)=>{state.decrements??=[];state.decrements.push({id,quantity});return state.stockResult??true;},
    dbInsertSubscriber:async()=>false,
    dbInsertProduct:async p=>{state.products??=[];state.products.push(p);return true;},
    dbInsertVariants:async variants=>{state.variants??=[];state.variants.push(...variants);return state.variantResult??true;},
    dbDeleteProduct:async()=>true,
    dbGetProducts:async()=>[],dbGetCategories:async()=>[],
  };
}
async function load(file,db,state={}) {
  const source=await fs.readFile(path.join(root,file),'utf8');
  const code=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,esModuleInterop:true}}).outputText;
  const sandboxModule={exports:{}};
  const imports={
    'next/server':{NextResponse:{json:(body,init)=>Response.json(body,init)}},
    '@/lib/neon':db,
    '@/lib/auth':{verifyToken:()=>({role:'admin'})},
    crypto,
    razorpay:class {orders={create:async input=>{state.gatewayOrders??=[];state.gatewayOrders.push(input);return {id:gatewayId,...input};}};},
  };
  const context=vm.createContext({module:sandboxModule,exports:sandboxModule.exports,require:id=>{if(!(id in imports))throw new Error('Blocked import '+id);return imports[id];},process:{env:{RAZORPAY_KEY_ID:'audit_public_fixture',RAZORPAY_KEY_SECRET:fakeKey}},console:{error:()=>{}},Request,Response,URL,crypto});
  new vm.Script(code,{filename:file}).runInContext(context);
  return sandboxModule.exports;
}
async function post(route,body,authorized=false){const response=await route.POST(new Request('http://audit.local/api',{method:'POST',headers:{'content-type':'application/json',...(authorized?{Authorization:'Bearer isolated-fixture'}:{})},body:JSON.stringify(body)}));return {status:response.status,body:await response.json()};}
function payment(items,orderId='merchant_fixture'){return {razorpay_order_id:gatewayId,razorpay_payment_id:paymentId,razorpay_signature:signature,shipping:{email:'audit@example.invalid'},orderId,items};}
if(!adminOnly) for(const file of ['src/app/api/create-order/route.ts','src/app/api/razorpay/order/route.ts']){
  for(const [name,body] of [
    ['client amount overrides server prices',{amount:100,items:[{variantId:variant.id,quantity:50,giftWrap:false}]}],
    ['unknown variant becomes shipping-only payment',{items:[{variantId:'unknown',quantity:1,giftWrap:false}]}],
    ['negative quantity accepted',{items:[{variantId:variant.id,quantity:-1,giftWrap:false}]}],
    ['fractional quantity accepted',{items:[{variantId:variant.id,quantity:1.5,giftWrap:false}]}],
    ['quantity above stock accepted',{items:[{variantId:variant.id,quantity:99,giftWrap:false}]}],
  ]){const state={}; const route=await load(file,deps(state),state);const response=await post(route,body);results.push({route:file,name,response,gatewayAmounts:state.gatewayOrders?.map(o=>o.amount)});}
}
if(!adminOnly) for(const file of ['src/app/api/verify-payment/route.ts','src/app/api/razorpay/verify/route.ts']){
  {
    const state={insertResult:false,stockResult:false};const route=await load(file,deps(state));
    const response=await post(route,payment([{variantId:variant.id,quantity:1,giftWrap:false}]));
    results.push({route:file,name:'order and stock write failures still succeed',response,attemptedOrders:state.orders?.length,decrements:state.decrements});
  }
  {
    const state={};const route=await load(file,deps(state));
    const response=await post(route,{razorpay_order_id:gatewayId,razorpay_payment_id:paymentId,razorpay_signature:signature});
    results.push({route:file,name:'missing fulfillment data still succeeds',response,attemptedOrders:state.orders?.length||0});
  }
  {
    const state={};const route=await load(file,deps(state));
    const items=[{variantId:variant.id,quantity:1,giftWrap:false}];
    const first=await post(route,payment(items,'merchant_A'));
    const second=await post(route,payment(items,'merchant_B'));
    results.push({route:file,name:'same gateway proof fulfills twice',responses:[first,second],merchantOrderIds:state.orders?.map(o=>o.id),decrements:state.decrements});
  }
  {
    const state={};const route=await load(file,deps(state));
    const response=await post(route,payment([{variantId:variant.id,quantity:1,giftWrap:false},{variantId:variant.id,quantity:1,giftWrap:true}]));
    results.push({route:file,name:'mixed gift wrap for same variant misprices order',response,actualSubtotal:state.orders?.[0].subtotal,expectedSubtotal:550,actualTotal:state.orders?.[0].total,expectedTotal:817});
  }
  {
    const state={};const route=await load(file,deps(state));
    const response=await post(route,payment([{variantId:variant.id,quantity:-2,giftWrap:false}]));
    results.push({route:file,name:'negative quantity reaches stock mutation',response,decrements:state.decrements,stockFormulaResult:Math.max(0,variant.stock-(-2))});
  }
}
if(!adminOnly){
 const route=await load('src/app/api/newsletter/route.ts',deps());
 results.push({route:'src/app/api/newsletter/route.ts',name:'failed subscriber insert returns success',response:await post(route,{email:'audit@example.invalid'})});
}
{
 const state={variantResult:false};const route=await load('src/app/api/admin/product/route.ts',deps(state));
 const body={product:{id:'fixture-new',title:'Fixture New',description:'Fixture',category_id:'rings',images:[]},variants:[{...variant,id:'fixture-new-v',product_id:'fixture-new',price:100}]};
 results.push({route:'src/app/api/admin/product/route.ts',name:'variant write failure leaves saved product and 200',response:await post(route,body,true),insertedProducts:state.products?.length,forwardedProductId:state.variants?.[0]?.product_id});
}
{
 const state={};const route=await load('src/app/api/admin/product/route.ts',deps(state));
 const body={product:{id:'fixture-new',title:'Fixture New',description:'Fixture',category_id:'rings',images:[]},variants:[{...variant,id:'fixture-existing-v',price:100}]};
 results.push({route:'src/app/api/admin/product/route.ts',name:'unrelated variant product_id accepted',response:await post(route,body,true),createdProductId:state.products?.[0]?.id,forwardedProductId:state.variants?.[0]?.product_id});
}
await fs.writeFile('docs/audits/2026-10-28/backend/isolated-route-results.json',JSON.stringify(results,null,2)+'\n');
console.log(JSON.stringify(results.map(r=>({route:r.route,name:r.name,status:r.response?.status??r.responses?.map(x=>x.status),gatewayAmounts:r.gatewayAmounts,actualSubtotal:r.actualSubtotal,expectedSubtotal:r.expectedSubtotal,orders:r.merchantOrderIds})),null,2));
