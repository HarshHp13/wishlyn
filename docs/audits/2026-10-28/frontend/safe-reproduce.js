// Pass this function file to playwright-cli run-code --filename. Do not run against a user browser.
// Reconstructed from the exact audit phase files; the context-level guard and cleanup were added for R2.
// Syntax-checked only during R2. Original observed JSON is preserved separately.
// eslint-disable-next-line @typescript-eslint/no-unused-expressions -- Playwright CLI evaluates this function expression.
async page => {
  const context = page.context();
  const blocked = [];
  let sdkFailed = false;
  let resolveSdkFailure;
  const sdkFailure = new Promise(resolve => { resolveSdkFailure = resolve; });
  const recordSdkFailure = request => {
    if (request.url().startsWith('https://checkout.razorpay.com/')) {
      sdkFailed = true;
      resolveSdkFailure();
    }
  };
  page.on('requestfailed', recordSdkFailure);
  const guard = async route => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    // Page-specific mocks below can only abort/fulfill. Anything they don't handle stays blocked here.
    if (!['GET', 'HEAD'].includes(method) || url.pathname.startsWith('/api/')) {
      blocked.push({method, path: url.pathname});
      return route.fulfill({status: 503, contentType: 'application/json', body: '{"error":"audit fixture blocks server API/mutation"}'});
    }
    if (url.hostname === 'checkout.razorpay.com' || url.hostname === 'api.postalpincode.in') return route.abort();
    if (request.resourceType() === 'document' && url.origin !== 'http://localhost:3001') return route.abort();
    return route.continue();
  };
  await context.route('**/*', guard);
  const screens = async page => {
  const results=[];
  for(const path of ['/', '/product/emerald-butterfly-clover-gold-cuff-bracelets-1e688b0d','/login','/wishlist','/admin','/profile','/checkout','/product/does-not-exist']) {
    const errors=[];
    const onError=e=>errors.push(e.message);
    page.on('pageerror',onError);
    await page.setViewportSize({width:390,height:844});
    const res=await page.goto('http://localhost:3001'+path);
    await page.locator('body').waitFor();
    if(path==='/profile'||path==='/checkout')await page.waitForURL('**/login?redirect=**');
    const mobile=await page.evaluate(()=>({url:location.href,title:document.title,h1:[...document.querySelectorAll('h1')].map(x=>x.textContent),overflow:document.documentElement.scrollWidth>innerWidth,canonical:document.querySelector('link[rel="canonical"]')?.getAttribute('href')||null,robots:document.querySelector('meta[name="robots"]')?.content||null,labels:[...document.querySelectorAll('main input, main textarea, main select')].map(e=>({tag:e.tagName,type:e.type,name:e.name,id:e.id,placeholder:e.placeholder,labelCount:e.labels?.length||0,ariaLabel:e.getAttribute('aria-label'),autocomplete:e.getAttribute('autocomplete'),fontSize:getComputedStyle(e).fontSize})),smallText:[...document.querySelectorAll('header a, header .announcement, footer a, footer p')].filter(e=>e.getBoundingClientRect().width).map(e=>({text:e.textContent.trim().slice(0,70),size:getComputedStyle(e).fontSize})).filter(e=>parseFloat(e.size)<12)}));
    await page.setViewportSize({width:320,height:780});
    const narrow=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth,overflowElements:[...document.querySelectorAll('main *')].filter(e=>e.getBoundingClientRect().right>innerWidth+1&&e.getBoundingClientRect().width).slice(0,12).map(e=>({tag:e.tagName,class:e.className,right:e.getBoundingClientRect().right}))}));
    page.off('pageerror',onError);
    results.push({requestedPath:path,status:res.status(),mobile,narrow,errors});
  }
  return results;
};

  const interactions = async page => {
 const out={};
 await page.setViewportSize({width:390,height:844});
 await page.goto('http://localhost:3001/product/golden-twist-drop-earrings-edd44a4e');
 await page.getByRole('checkbox',{name:'🎁 Send as a Gift (+ ₹350)'}).check();
 await page.getByPlaceholder('Write your custom gift message here...').fill('Audit gift for Alice');
 await page.getByRole('button',{name:'Add To Shopping Bag',exact:true}).click();
 await page.getByRole('dialog',{name:'Shopping Cart'}).waitFor();
 await page.getByRole('button',{name:'Close cart',exact:true}).click();
 await page.getByPlaceholder('Write your custom gift message here...').fill('Audit gift for Bob');
 await page.getByRole('button',{name:'Add To Shopping Bag',exact:true}).click();
 await page.getByRole('dialog',{name:'Shopping Cart'}).waitFor();
 out.giftMerge=await page.evaluate(()=>JSON.parse(localStorage.getItem('wishlyn-cart-guest')).map(x=>({quantity:x.quantity,giftMessage:x.giftMessage,giftWrap:x.giftWrap})));
 await page.getByRole('button',{name:'Close cart',exact:true}).click();
 await page.route('https://api.postalpincode.in/**',route=>route.abort());
 await page.getByRole('textbox',{name:'Postal code',exact:true}).fill('111111');
 await page.getByText('⚡ Express Delivery: Estimated 2-3 business days. COD available.',{exact:true}).waitFor();
 out.failedPincode=await page.locator('main').innerText().then(t=>t.match(/⚡ Express Delivery:[^\n]+/)?.[0]);
 await page.unroute('https://api.postalpincode.in/**');
 await page.getByRole('button',{name:'Add to wishlist',exact:true}).click();
 await page.route('**/api/wishlist-products',route=>route.fulfill({status:500,contentType:'application/json',body:'{"error":"audit injected outage"}'}));
 await page.goto('http://localhost:3001/wishlist');
 await page.getByRole('heading',{name:'Your wishlist is empty',exact:true}).waitFor();
 out.wishlistFailure=await page.locator('main').innerText();
 await page.screenshot({path:'/tmp/wishlyn-fe-reproduction-wishlist-outage.png'});
 await page.unroute('**/api/wishlist-products');
 await page.evaluate(()=>{localStorage.setItem('wishlyn-user',JSON.stringify({id:'audit-a',email:'audit-a@example.invalid',role:'customer'})); window.dispatchEvent(new Event('wishlyn-auth-change'));});
 await page.getByRole('link',{name:'Account profile (audit-a@example.invalid)',exact:true}).count();
 await page.evaluate(()=>{localStorage.removeItem('wishlyn-user');localStorage.removeItem('wishlyn-token');localStorage.removeItem('wishlyn-cart-guest');window.dispatchEvent(new Event('wishlyn-auth-change'));});
 await page.getByRole('button',{name:/Open shopping bag/}).click();
 await page.getByRole('dialog',{name:'Shopping Cart'}).waitFor();
 out.logoutCart=await page.evaluate(()=>JSON.parse(localStorage.getItem('wishlyn-cart-guest')).map(x=>({title:x.product.title,quantity:x.quantity,giftMessage:x.giftMessage})));
 await page.getByRole('button',{name:'Close cart',exact:true}).click();
 await page.evaluate(()=>{localStorage.setItem('wishlyn-user',JSON.stringify({id:'audit-b',email:'audit-b@example.invalid',role:'customer'}));window.dispatchEvent(new Event('wishlyn-auth-change'));});
 await page.getByRole('button',{name:/Open shopping bag/}).click();
 await page.getByRole('dialog',{name:'Shopping Cart'}).waitFor();
 out.otherAccountCart=await page.evaluate(()=>JSON.parse(localStorage.getItem('wishlyn-cart-profile-audit-b@example.invalid')).map(x=>({title:x.product.title,quantity:x.quantity,giftMessage:x.giftMessage})));
 await page.getByRole('button',{name:'Close cart',exact:true}).click();
 return out;
};

  const checkout = async page => {
 const out={};
 await page.route('https://checkout.razorpay.com/**', route=>route.abort());
 await page.route('**/api/create-order', route=>route.fulfill({status:503,contentType:'application/json',body:'{"error":"audit blocks order creation"}'}));
 await page.route('**/api/verify-payment', route=>route.fulfill({status:503,contentType:'application/json',body:'{"error":"audit blocks payment verification"}'}));
 const address={firstName:'Audit Alice',lastName:'Fixture',email:'audit-a@example.invalid',phone:'111',address:'Audit-only first account address',city:'Audit City',state:'Audit State',zipCode:'xyz',country:'India'};
 await page.evaluate(addr=>localStorage.setItem('wishlyn-saved-addresses',JSON.stringify([addr])),address);
 await page.goto('http://localhost:3001/checkout');
 await page.getByRole('heading',{name:'Shipping Address',exact:true}).waitFor();
 out.accountAddress=await page.evaluate(()=>({currentUser:JSON.parse(localStorage.getItem('wishlyn-user')).email,firstName:document.querySelector('#firstName').value,address:document.querySelector('#address').value,phone:document.querySelector('#phone').value,email:document.querySelector('#email').value}));
 out.inputs=await page.locator('main input,main select').evaluateAll(es=>es.map(e=>({id:e.id,type:e.type,autocomplete:e.autocomplete,pattern:e.pattern,inputMode:e.inputMode,required:e.required,disabled:e.disabled})));
 await page.getByRole('button',{name:'Continue to Payment',exact:true}).click();
 await page.getByRole('heading',{name:'Payment Details',exact:true}).waitFor();
 out.invalidAddressAccepted=true;
 out.paymentBefore=await page.locator('main').innerText();
 // Make the original observed ordering explicit: the preloaded SDK request has already failed.
 if (!sdkFailed) await Promise.race([sdkFailure, new Promise((_, reject) => setTimeout(() => reject(new Error('SDK failure was not observed before Pay; abort fixture')), 10000))]);
 await page.getByRole('button',{name:/Pay via Razorpay/}).click();
 await page.waitForTimeout(1800);
 out.failedSdk=await page.evaluate(()=>({button:[...document.querySelectorAll('main button')].map(b=>({text:b.textContent,disabled:b.disabled})),error:[...document.querySelectorAll('[role="alert"]')].map(e=>e.textContent),razorpayAvailable:typeof window.Razorpay,scriptPresent:!!document.querySelector('script[src="https://checkout.razorpay.com/v1/checkout.js"]')}));
 await page.screenshot({path:'/tmp/wishlyn-fe-reproduction-checkout-sdk-failure.png'});
 await page.unroute('https://checkout.razorpay.com/**');
 await page.unroute('**/api/create-order');
 await page.unroute('**/api/verify-payment');
 return out;
};

  const adminFilters = async page => {
 const out={};
 await page.evaluate(()=>{localStorage.clear();document.cookie='wishlyn-user=;path=/;max-age=0';document.cookie='wishlyn-token=;path=/;max-age=0';});
 await page.goto('http://localhost:3001/?category=rings#shop');
 await page.getByRole('button',{name:'Reset filters',exact:true}).click();
 out.resetUrl=page.url();
 out.resetProducts=await page.locator('#shop article').count();
 await page.reload();
 out.afterReloadNoResults=await page.getByRole('heading',{name:'No pieces found, just yet.',exact:true}).isVisible();
 await page.goto('http://localhost:3001');
 await page.getByRole('combobox',{name:'Sort jewellery',exact:true}).selectOption('price-high');
 await page.getByRole('button',{name:'Earrings',exact:true}).click();
 await page.waitForURL('**category=earrings**');
 await page.getByRole('button',{name:'Earrings',exact:true}).waitFor();
 out.sortAfterCategory=await page.getByRole('combobox',{name:'Sort jewellery',exact:true}).inputValue();
 await page.evaluate(()=>{localStorage.setItem('wishlyn-user',JSON.stringify({id:'audit-admin',email:'audit-admin@example.invalid',role:'admin'}));localStorage.setItem('wishlyn-token','audit-fixture-not-valid');});
 await page.route('**/api/auth/me',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({user:{id:'audit-admin',email:'audit-admin@example.invalid',role:'admin'}})}));
 await page.route('**/api/admin/product',route=>route.fulfill({status:503,contentType:'application/json',body:'{"error":"audit injected outage"}'}));
 await page.goto('http://localhost:3001/admin');
 await page.getByRole('heading',{name:'Catalog Admin Dashboard',exact:true}).waitFor();
 await page.getByText('No products in Neon Database. Use the creator form to add your first luxury piece!',{exact:true}).waitFor();
 out.adminFailure={body:await page.locator('main').innerText(),fieldLabels:await page.locator('main input,main textarea,main select').evaluateAll(es=>es.map(e=>({type:e.type,placeholder:e.placeholder,labels:e.labels?.length,ariaLabel:e.getAttribute('aria-label')})))};
 const widths=[];
 for(const width of [320,390,768,1440]){await page.setViewportSize({width,height:900});widths.push(await page.evaluate(()=>({width:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth})));}
 out.adminWidths=widths;
 await page.setViewportSize({width:390,height:844});
 await page.screenshot({path:'/tmp/wishlyn-fe-reproduction-admin-mobile.png',fullPage:true});
 await page.unroute('**/api/auth/me');
 await page.unroute('**/api/admin/product');
 return out;
};

  const state = async page => {
 const out={};
 await page.evaluate(()=>localStorage.clear());
 await page.goto('http://localhost:3001');
 const second=await page.context().newPage();
 await second.goto('http://localhost:3001');
 await page.getByRole('button',{name:'Add Golden Clover Crystal Bracelet to wishlist',exact:true}).click();
 await page.getByRole('link',{name:'Wishlist (1 items)',exact:true}).waitFor();
 out.crossTab={first:await page.locator('header a[href="/wishlist"]').getAttribute('aria-label'),second:await second.locator('header a[href="/wishlist"]').getAttribute('aria-label'),sameStorage:await second.evaluate(()=>localStorage.getItem('wishlyn-wishlist-guest'))};
 await second.close();
 await page.goto('http://localhost:3001/product/golden-twist-drop-earrings-edd44a4e');
 await page.getByRole('button',{name:'Jewellery Care',exact:true}).click();
 out.productCare=await page.locator('[class*="tabContent"]').innerText();
 out.tabSemantics=await page.getByRole('button',{name:'Jewellery Care',exact:true}).evaluate(e=>({role:e.getAttribute('role'),ariaSelected:e.getAttribute('aria-selected'),ariaPressed:e.getAttribute('aria-pressed')}));
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.evaluate(()=>{localStorage.clear();localStorage.setItem('wishlyn-cart-guest',JSON.stringify([{quantity:1,product:{},variant:{}}]));});
 await page.goto('http://localhost:3001');
 await page.waitForTimeout(700);
 out.corruptCart={errors,body:(await page.locator('body').innerText()).slice(0,500)};
 await page.evaluate(()=>localStorage.clear());
 await page.goto('http://localhost:3001');
 return out;
};
  const results = {};
  try {
    // A fresh dedicated session is mandatory: these are synthetic local-storage operations.
    await context.clearCookies();
    await page.goto('http://localhost:3001');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    results.screens = await screens(page);
    results.interactions = await interactions(page);
    // interactions leaves synthetic B active with the public product's local cart snapshot.
    results.checkout = await checkout(page);
    results.adminFilters = await adminFilters(page);
    results.state = await state(page);
    results.blockedRequests = blocked;
    return results;
  } finally {
    // Keep guards until all pages have left the application; clean only this dedicated audit session.
    for (const extra of context.pages()) if (extra !== page) await extra.close().catch(() => {});
    await page.goto('http://localhost:3001').catch(() => {});
    await page.evaluate(() => localStorage.clear()).catch(() => {});
    await context.clearCookies();
    await page.goto('about:blank').catch(() => {});
    page.off('requestfailed', recordSdkFailure);
    await context.unroute('**/*', guard);
  }
}
