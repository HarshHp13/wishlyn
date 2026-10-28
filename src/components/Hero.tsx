"use client";

import { useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowDown, ArrowUpRight, Sparkle } from "lucide-react";
import {
  motion,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
} from "framer-motion";
import type { Product } from "../data/db";
import GoldOrbit from "./GoldOrbit";
import { productImage } from '../lib/productImages';
import styles from "./Hero.module.css";

export default function Hero({
  featuredProduct,
}: {
  featuredProduct?: Product;
}) {
  const artwork = useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotion();
  const pointerX = useMotionValue(0);
  const pointerY = useMotionValue(0);
  const springX = useSpring(pointerX, { mass: 1, stiffness: 100, damping: 10 });
  const springY = useSpring(pointerY, { mass: 1, stiffness: 100, damping: 10 });
  const transform = useTransform(
    [springX, springY],
    ([x, y]) =>
      `perspective(1200px) rotateX(${-Number(y)}deg) rotateY(${Number(x)}deg)`,
  );

  return (
    <section className={styles.hero} aria-labelledby="hero-title">
      <div className={`${styles.inner} container`}>
        <div className={styles.copy}>
          <span className={styles.eyebrow}>
            <span /> EVERYDAY, A LITTLE EXTRAORDINARY
          </span>
          <h1 id="hero-title" className={styles.title}>
            A little gold.
            <br />
            <em>All you.</em>
          </h1>
          <p className={styles.subtitle}>
            For the coffee runs. The big nights.
            <br />
            And every version of you in between.
          </p>
          <Link href="/#shop" className={styles.cta}>
            Find your everyday shine <ArrowUpRight size={19} />
          </Link>
          <div className={styles.copyFoot}>
            <Sparkle size={20} strokeWidth={1} />
            <span>
              Thoughtfully made.
              <br />
              <strong>Effortlessly yours.</strong>
            </span>
          </div>
        </div>
        <div
          className={styles.artwork}
          ref={artwork}
          onPointerMove={(event) => {
            if (
              reduceMotion ||
              !window.matchMedia("(hover: hover) and (pointer: fine)").matches
            )
              return;
            const bounds = artwork.current?.getBoundingClientRect();
            if (!bounds) return;
            pointerX.set(
              ((event.clientX - bounds.left) / bounds.width - 0.5) * 8,
            );
            pointerY.set(
              ((event.clientY - bounds.top) / bounds.height - 0.5) * 6,
            );
          }}
          onPointerLeave={() => {
            pointerX.set(0);
            pointerY.set(0);
          }}
        >
          <span className={styles.collectionLabel}>
            THE EVERYDAY EDIT / WISHLYN
          </span>
          <div className={styles.halo} aria-hidden="true">
            <GoldOrbit />
          </div>
          <motion.div
            className={styles.depthGroup}
            style={{ transform: reduceMotion ? "none" : transform }}
          >
            <div className={styles.model}>
              <Image
                src="/editorial/model-cutout.webp"
                alt="Wishlyn jewellery styled with a cream silk outfit"
                fill
                sizes="(max-width: 700px) 95vw, 48vw"
                preload
                className={styles.modelImage}
              />
            </div>
            <div className={styles.floatingGold} aria-hidden="true">
              <Image
                src="/editorial/gold-hoops.webp"
                alt=""
                width={180}
                height={180}
              />
            </div>
            <span className={styles.sparkleOne} aria-hidden="true">
              ✧
            </span>
            <span className={styles.sparkleTwo} aria-hidden="true">
              ✦
            </span>
          </motion.div>
          {featuredProduct && (
            <Link
              href={`/product/${featuredProduct.id}`}
              className={styles.featured}
            >
              <div className={styles.featuredImage}>
                <Image
                  src={productImage(featuredProduct.images[0], 240)}
                  alt=""
                  fill
                  sizes="76px"
                />
              </div>
              <div>
                <span>THE PIECE TO KNOW</span>
                <strong>{featuredProduct.title}</strong>
                <small>
                  ₹{featuredProduct.basePrice.toLocaleString("en-IN")}
                </small>
              </div>
              <ArrowUpRight size={18} />
            </Link>
          )}
          <span className={styles.sideNote}>MADE TO MATCH YOU</span>
        </div>
        <a href="#collections" className={styles.scrollHint}>
          <ArrowDown size={15} /> A little more to love
        </a>
        <span className={styles.heroNumber} aria-hidden="true">
          01 — THE EVERYDAY EDIT
        </span>
      </div>
    </section>
  );
}
