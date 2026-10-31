/* Audit-only, offline checks. Application route source is transpiled in memory.
   All database calls are mocks. No network or configured runtime secrets used. */
/* eslint-disable @typescript-eslint/no-require-imports -- This offline harness evaluates CommonJS modules. */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const ts = require('typescript');
const jwt = require('jsonwebtoken');
const { NextResponse } = require('next/server');
const root = path.resolve(__dirname, '../../../..');
const source = file => fs.readFileSync(path.join(root, file), 'utf8');
function load(file, imports, env={}, extra={}) {
 const code = ts.transpileModule(source(file), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true}}).outputText;
 const sandboxModule={exports:{}};
 const context={module:sandboxModule,exports:sandboxModule.exports,require:(name)=>{if(Object.hasOwn(imports,name)) return imports[name];throw Error('Blocked dependency: '+name);},process:{env},crypto:crypto.webcrypto,console,Response,Request,URL,...extra};
 vm.runInNewContext(code,context,{filename:file});
 return sandboxModule.exports;
}
(async()=>{
 const auth=load('src/lib/auth.ts',{'jsonwebtoken':jwt,'bcryptjs':require('bcryptjs')},{JWT_SECRET:crypto.randomBytes(32).toString('hex')});
 let writes=0;
 const signup=load('src/app/api/auth/signup/route.ts',{'next/server':{NextResponse},'@/lib/auth':auth,'@/lib/neon':{dbGetProfileByEmail:async()=>null,dbCreateProfile:async(p)=>{writes++;return {...p};}}});
 const resp=await signup.POST(new Request('http://audit.invalid/api/auth/signup',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'audit-admin@example.invalid',password:crypto.randomBytes(16).toString('hex')})}));
 const data=await resp.json();
 const admin=load('src/app/api/admin/product/route.ts',{'next/server':{NextResponse},'@/lib/auth':auth,'@/lib/neon':{dbGetProducts:async()=>[],dbGetCategories:async()=>[]}});
 const adminResponse=await admin.GET(new Request('http://audit.invalid/api/admin/product',{headers:{Authorization:'Bearer '+data.token}}));
 const missing=await admin.GET(new Request('http://audit.invalid/api/admin/product'));
 const customerToken=auth.signToken({id:'audit-customer',email:'customer@example.invalid',role:'customer'});
 const customer=await admin.GET(new Request('http://audit.invalid/api/admin/product',{headers:{Authorization:'Bearer '+customerToken}}));
 const fallbackAuth=load('src/lib/auth.ts',{'jsonwebtoken':jwt,'bcryptjs':require('bcryptjs')});
 const fallback=source('src/lib/auth.ts').match(/JWT_SECRET\s*=.*?\|\|\s*'([^']+)'/)[1];
 const forged=jwt.sign({id:'nonexistent-audit-user',email:'unregistered@example.invalid',role:'admin'},fallback,{expiresIn:'5m'});
 const storage=new Map();
 const window={dispatchEvent:()=>{}};
 const document={cookie:''};
 const localStorage={getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)};
 const authClient=load('src/lib/authClient.ts',{}, {}, {window,document,localStorage,CustomEvent:class{}});
 authClient.setAuthSession(data.token,data.user);
 storage.set('wishlyn-saved-addresses','[{"address":"AUDIT-ONLY SYNTHETIC ADDRESS"}]');
 const cookieBefore=document.cookie;
 authClient.clearAuthSession();
 const result={networkCalls:0,realDatabaseWrites:0,mockProfileWrites:writes,signup:{status:resp.status,role:data.user.role,adminCatalogStatus:adminResponse.status},negativeAuthorizationControls:{missingTokenStatus:missing.status,customerTokenStatus:customer.status},fallbackKey:{forgedUnregisteredAdminAccepted:fallbackAuth.verifyToken(forged)?.role==='admin'},session:{browserStorageTokenCleared:!storage.has('wishlyn-token'),tokenStillValidAfterLogout:auth.verifyToken(data.token)!==null,savedAddressesRemainAfterLogout:storage.has('wishlyn-saved-addresses'),cookieUsesSecure:/;\s*secure/i.test(cookieBefore),cookieUsesHttpOnly:/;\s*httponly/i.test(cookieBefore)}};
 fs.writeFileSync(path.join(__dirname,'isolated-auth-results.json'),JSON.stringify(result,null,2)+'\n');
 console.log(JSON.stringify(result,null,2));
})().catch(e=>{console.error(e.message);process.exitCode=1;});
