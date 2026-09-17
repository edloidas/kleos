/**
 * A member's face, on the cards that show one. A member the last round never named
 * has no avatar, and an empty ring beats a broken image.
 */
export function Avatar({ src, className }: { src: string; className: string }) {
  const classes = `${className} shrink-0 rounded-full border border-line-soft bg-sunken object-cover`;

  return src ? (
    <img src={src} alt="" loading="lazy" className={classes} />
  ) : (
    <span className={classes} aria-hidden="true" />
  );
}
