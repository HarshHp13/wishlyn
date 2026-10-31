import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight, Droplets, Gift, Sparkles, Truck } from "lucide-react";
import type { Category, Product } from "../data/db";
import { productImage } from '../lib/productImages';
import styles from "./Editorial.module.css";

const categoryCopy: Record<string, { line: string; label: string }> = {
  earrings: { line: "A little statement.", label: "Earrings" },
  necklaces: { line: "Close to your heart.", label: "Necklaces" },
  bracelets: { line: "Your daily plus-one.", label: "Bracelets" },
  rings: { line: "The finishing touch.", label: "Rings" },
};

export function BrandPromises() {
  return (
    <div className={styles.promises} aria-label="The Wishlyn promise">
      <div className="container">
        <span>
          <Droplets size={17} strokeWidth={1.3} /> Explore materials and finishes
        </span>
        <span>
          <Sparkles size={17} strokeWidth={1.3} /> Made for everyday wear
        </span>
        <span>
          <Gift size={17} strokeWidth={1.3} /> A little gift, a lot of love
        </span>
        <span>
          <Truck size={19} strokeWidth={1.3} /> Free shipping from ₹3,000
        </span>
      </div>
    </div>
  );
}

export function Collections({
  categories,
  products,
}: {
  categories: Category[];
  products: Product[];
}) {
  const available = categories
    .filter(
      (category) =>
        category.id !== "all" &&
        products.some((product) => product.categoryId === category.id),
    )
    .slice(0, 3);
  const preferred: Record<string, string> = {
    earrings: "sculptural-gold-fan",
    necklaces: "gold-teardrop",
    bracelets: "golden-clover",
  };
  return (
    <section
      className={`${styles.collections} container`}
      id="collections"
      aria-labelledby="collections-title"
    >
      <div className={styles.sectionHeading}>
        <div>
          <span className="eyebrow">FIND YOUR KIND OF GOLD</span>
          <h2 id="collections-title">
            Little things. <em>Big feeling.</em>
          </h2>
        </div>
        <Link href="/#shop" className="text-link">
          Explore all jewellery <ArrowUpRight size={17} />
        </Link>
      </div>
      <div className={styles.collectionGrid}>
        {available.map((category, index) => {
          const product =
            products.find(
              (p) =>
                p.categoryId === category.id &&
                p.id.includes(preferred[category.id] || "__"),
            ) || products.find((p) => p.categoryId === category.id);
          if (!product) return null;
          const copy = categoryCopy[category.id];
          return (
            <Link
              className={styles.collectionCard}
              key={category.id}
              href={`/?category=${encodeURIComponent(category.id)}#shop`}
            >
              <div className={styles.collectionImage}>
                <Image
                  src={productImage(product.images[0], 1000)}
                  alt={`${category.name} from the Wishlyn collection`}
                  fill
                  sizes="(max-width: 700px) 85vw, 33vw"
                />
                <span className={styles.collectionIndex}>0{index + 1}</span>
                <span className={styles.collectionArrow}>
                  <ArrowUpRight size={21} strokeWidth={1.3} />
                </span>
              </div>
              <div className={styles.collectionCaption}>
                <h3>{copy?.label || category.name}</h3>
                <span>{copy?.line || "Made to match you."}</span>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

export function BrandStory({ product }: { product?: Product }) {
  return (
    <section className={styles.story} id="story" aria-labelledby="story-title">
      <div className={`${styles.storyInner} container`}>
        <div className={styles.storyImage}>
          <Image
            src="/editorial/model-portrait.webp"
            alt="Golden Wishlyn earrings and bracelets styled for everyday wear"
            fill
            sizes="(max-width: 700px) 100vw, 45vw"
          />
          <span className={styles.imageNote}>WISHLYN / MADE TO MATCH YOU</span>
        </div>
        <div className={styles.storyCopy}>
          <span className="eyebrow">MORE THAN A FINISHING TOUCH</span>
          <h2 id="story-title">
            Wear a little
            <br />
            <em>of who you are.</em>
          </h2>
          <p>
            Some pieces just feel like you. The earrings you reach for without
            thinking. The necklace that goes everywhere you do.
          </p>
          <p>
            We make jewellery for those moments. Thoughtful details, effortless
            styling, and a little golden confidence in your everyday.
          </p>
          <Link href="/#shop" className="text-link">
            Meet your next favourite <ArrowUpRight size={18} />
          </Link>
          <div className={styles.storySignature}>
            With love, <span>Wishlyn</span>
          </div>
        </div>
      </div>
      {product && (
        <div className={`${styles.spotlight} container`}>
          <span className="eyebrow">SMALL DETAILS. MAIN CHARACTER ENERGY.</span>
          <h2>
            A golden state <em>of mind.</em>
          </h2>
          <div className={styles.spotlightImage}>
            <Image
              src="/editorial/gold-leaf.webp"
              alt={product.title}
              width={480}
              height={360}
            />
          </div>
          <Link href={`/product/${product.id}`} className="text-link">
            Discover {product.title} <ArrowUpRight size={18} />
          </Link>
        </div>
      )}
    </section>
  );
}
