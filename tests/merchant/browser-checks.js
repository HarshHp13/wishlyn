/* eslint-disable @typescript-eslint/no-unused-expressions -- Playwright CLI requires a standalone function expression. */
async page => {
  await page.unroute('**/*');
  page.removeAllListeners('pageerror');
  const pixel = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRXkAAAAASUVORK5CYII=', 'base64');
  const result = { provenance: 'Production Next build, synthetic intercepted API and upload responses; no live provider/database writes.' };
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  let authRequests = 0, uploadRequests = 0, createRequests = 0, updateRequests = 0, product = null;
  const categories = [{ id: 'rings', name: 'Rings', slug: 'rings' }];
  const image = 'https://res.cloudinary.com/dk6aax1vi/image/upload/fixture/ring.webp';
  const json = (route, body, status=200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.href === image) return route.fulfill({contentType:'image/png',body:pixel});
    if (url.origin !== 'http://localhost:3144') return route.abort();
    if (!url.pathname.startsWith('/api/')) return route.continue();
    if (url.pathname === '/api/auth/me') {
      authRequests++;
      if (authRequests > 1) await new Promise(resolve => setTimeout(resolve, 100));
      if (authRequests === 3) return json(route,{error:'Fixture account verification outage'},503);
      return json(route, { user: { id:'fixture-admin', email:'staff@fixture.invalid', role:'admin' } });
    }
    if (url.pathname === '/api/cloudinary/upload') {
      uploadRequests++;
      return uploadRequests === 1 ? json(route, { error:'Fixture upload outage; retry.' },503) : json(route,{url:image});
    }
    if (url.pathname === '/api/admin/product') {
      const method = route.request().method();
      if (method === 'GET') {
        if (url.searchParams.has('id')) return json(route,{product});
        return json(route,{products:product?[{id:product.id,title:product.title,status:product.status,revision:product.revision,availableStock:product.variants.reduce((sum,v)=>sum+v.stock-v.reservedStock,0),lowStock:true,updatedAt:product.updatedAt}]:[],categories,nextOffset:null});
      }
      const body = route.request().postDataJSON();
      if (method === 'POST') {
        createRequests++;
        if (createRequests === 1) return json(route,{error:'Fixture save outage; your form is intact.'},503);
      } else updateRequests++;
      product = { ...body, id:product?.id || 'fixture-ring-server-id', revision:(product?.revision || 0)+1, updatedAt:'2026-10-29T10:00:00Z', variants:body.variants.map((v,i)=>({id:v.id || 'fixture-variant-'+i,productId:'fixture-ring-server-id',metalType:v.metalType,purity:v.purity,size:v.size,price:v.price,stock:(product?.variants[i]?.stock || 0)+v.stockAdjustment,reservedStock:0,active:v.active})),history:[{id:'fixture-stock-event',variantId:'fixture-variant-0',actorId:'fixture-admin',adjustment:5,stockBefore:0,stockAfter:5,reason:body.stockReason || 'Fixture history',createdAt:'2026-10-29T10:00:00Z'}] };
      return json(route,{product},method==='POST'?201:200);
    }
    return json(route,{error:'Unexpected API blocked in fixture'},503);
  });
  await page.setViewportSize({width:320,height:900});
  await page.goto('http://localhost:3144/admin');
  await page.getByRole('heading',{name:'Catalogue & inventory',exact:true}).waitFor();
  await page.getByLabel('Product title',{exact:true}).fill('Browser fixture ring');
  await page.getByLabel('Description',{exact:true}).fill('Verified synthetic steel ring for browser checks.');
  await page.getByLabel('Category',{exact:true}).selectOption('rings');
  await page.getByLabel('Material / metal · 1',{exact:true}).fill('Steel');
  await page.getByLabel('Finish / purity · 1',{exact:true}).fill('Gold plated');
  await page.getByLabel('Size (optional) · 1',{exact:true}).fill('7');
  await page.getByLabel('Price (₹) · 1',{exact:true}).fill('299.50');
  await page.getByLabel('Initial stock · 1',{exact:true}).fill('5');
  await page.getByLabel('Stock adjustment reason',{exact:true}).fill('Fixture supplier delivery');
  await page.getByLabel('Add product images',{exact:true}).setInputFiles({name:'fixture-ring.png',mimeType:'image/png',buffer:pixel});
  await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
  await page.getByLabel('Product title',{exact:true}).waitFor();
  result.retainedOnAuthRefresh = await page.getByLabel('Product title',{exact:true}).inputValue() === 'Browser fixture ring' && await page.getByText('fixture-ring.png',{exact:true}).count() === 1;
  await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
  await page.getByText('Your account could not be verified.',{exact:true}).waitFor();
  result.privateFormHiddenOnAuthFailure = await page.getByLabel('Product title',{exact:true}).count() === 0;
  await page.getByRole('button',{name:'Retry account',exact:true}).click();
  await page.getByLabel('Product title',{exact:true}).waitFor();
  result.retainedOnAuthFailure = await page.getByLabel('Product title',{exact:true}).inputValue() === 'Browser fixture ring' && await page.getByText('fixture-ring.png',{exact:true}).count() === 1;
  await page.getByRole('button',{name:'Save product',exact:true}).click();
  await page.getByText('Fixture upload outage; retry.',{exact:true}).waitFor();
  result.retainedOnUploadFailure = await page.getByLabel('Product title',{exact:true}).inputValue() === 'Browser fixture ring' && await page.getByText('fixture-ring.png',{exact:true}).count() === 1;
  await page.screenshot({path:'/tmp/wishlyn-w4-browser/admin-320-retry.png',fullPage:true});
  await page.getByRole('button',{name:'Save product',exact:true}).click();
  await page.getByText('Fixture save outage; your form is intact.',{exact:true}).waitFor();
  result.retainedOnSaveFailure = await page.getByLabel('Size (optional) · 1',{exact:true}).inputValue() === '7' && await page.getByText('fixture-ring.png · Uploaded',{exact:true}).count() === 1;
  await page.getByRole('button',{name:'Save product',exact:true}).click();
  await page.getByText('Product saved as draft.',{exact:true}).waitFor();
  result.draftCreated = product?.status === 'draft' && product?.variants[0].size === '7';
  result.uploadWasNotRepeatedAfterSaveFailure = uploadRequests === 2;
  await page.getByLabel('I have checked that the images, material, finish and description accurately represent this product.',{exact:true}).check();
  await page.getByLabel('Save product as',{exact:true}).selectOption('published');
  await page.getByLabel('Stock adjustment (+/−) · 1',{exact:true}).fill('2');
  await page.getByLabel('Stock adjustment reason',{exact:true}).fill('Fixture replenishment');
  await page.getByRole('button',{name:'Save product',exact:true}).click();
  await page.getByText('Product saved as published.',{exact:true}).waitFor();
  result.editedPublishedReplenished = product?.status === 'published' && product?.variants[0].stock === 7;
  result.publicLink = await page.getByRole('link',{name:'View published product',exact:true}).getAttribute('href');
  await page.getByLabel('Save product as',{exact:true}).selectOption('archived');
  await page.getByRole('button',{name:'Save product',exact:true}).click();
  await page.getByText('Product saved as archived.',{exact:true}).waitFor();
  result.archivedWithStableIdentity = product?.status === 'archived' && product?.id === 'fixture-ring-server-id';
  result.stockHistory = await page.getByRole('heading',{name:'Stock adjustment history',exact:true}).count() === 1;
  result.reflow = [];
  for (const width of [320,390,768,1440]) {
    await page.setViewportSize({width,height:900});
    result.reflow.push(await page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,logoOffset:(()=>{const r=document.querySelector('header img').getBoundingClientRect();return Math.abs(r.x+r.width/2-innerWidth/2)})()})));
  }
  await page.screenshot({path:'/tmp/wishlyn-w4-browser/admin-desktop.png',fullPage:true});
  await page.setViewportSize({width:320,height:900});
  await page.evaluate(()=>{const sizes=[...document.querySelectorAll('main *')].map(el=>[el,parseFloat(getComputedStyle(el).fontSize)]);for(const [el,size] of sizes)if(size)el.style.fontSize=(size*2)+'px'});
  result.doubledText = await page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth}));
  await page.screenshot({path:'/tmp/wishlyn-w4-browser/admin-320-double-text.png',fullPage:true});
  result.errors = errors;
  result.requests = {authRequests,uploadRequests,createRequests,updateRequests};
  return result;
}
