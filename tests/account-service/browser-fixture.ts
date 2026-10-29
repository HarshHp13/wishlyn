import { hashPassword } from "../../src/lib/auth";
import { query, closeDatabase } from "../../src/lib/database";
import { createPurchase } from "../../src/lib/commerce/service";
import { migrate } from "../../scripts/migrate.mjs";
async function main() {
  const configured = process.env.ACCOUNT_BROWSER_DATABASE_URL;
  if (!configured) throw new Error("ACCOUNT_BROWSER_DATABASE_URL required");
  const parsed = new URL(configured);
  if (
    !["localhost", "127.0.0.1"].includes(parsed.hostname) ||
    !/^\/wishlyn_[a-z0-9_]*account_service_test$/.test(parsed.pathname)
  )
    throw new Error("Use disposable local account_service_test database");
  process.env.DATABASE_URL = configured;
  process.env.DB_ALLOW_LOCAL_PLAINTEXT = "true";
  Object.assign(process.env, { NODE_ENV: "test" });
  await migrate(configured, true);
  await query("TRUNCATE profiles,categories CASCADE");
  await query("TRUNCATE request_budgets");
  const hash = await hashPassword("Browser fixture password");
  await query(
    "INSERT INTO profiles(id,email,password_hash,role) VALUES('browser-a','browser-a@example.test',$1,'customer'),('browser-b','browser-b@example.test',$1,'customer'),('browser-admin','browser-admin@example.test',$1,'admin') ON CONFLICT(id) DO UPDATE SET password_hash=EXCLUDED.password_hash",
    [hash],
  );
  await query(
    "INSERT INTO categories(id,name,slug) VALUES('test','Test','test') ON CONFLICT DO NOTHING",
  );
  await query(
    "INSERT INTO products(id,title,description,category_id,images) VALUES('browser-product','Synthetic account piece','Browser fixture only','test',ARRAY['/editorial/gold-leaf.webp']) ON CONFLICT DO NOTHING",
  );
  await query(
    "INSERT INTO product_variants(id,product_id,metal_type,purity,price,stock) VALUES('browser-variant','browser-product','Fixture','Plated',199,50) ON CONFLICT DO NOTHING",
  );
  await query("INSERT INTO account_wishlists(owner_id,browser_imported) VALUES('browser-a',true)");
  const order = await createPurchase(
    { id: "browser-a", email: "browser-a@example.test" },
    {
      requestKey: "browser-fixture-key-1",
      shipping: {
        firstName: "Asha",
        lastName: "Fixture",
        phone: "9876543210",
        address: "123 Browser Test Lane",
        city: "Mumbai",
        state: "Maharashtra",
        zipCode: "400001",
        country: "India",
      },
      items: [
        {
          variantId: "browser-variant",
          quantity: 1,
          giftWrap: true,
          giftMessage: "Synthetic gift",
        },
      ],
    },
  );
  console.log(JSON.stringify({ orderId: order.id }));
  await closeDatabase();
}
void main();
