/**
 * Safe JSON-LD injection (security report 2026-10-14, H1).
 *
 * `JSON.stringify()` does NOT escape `<` or `>`. Inside a
 * `<script type="application/ld+json">` block an HTML parser ends the
 * element at the first `</script>` — so a product/vendor name like
 *   </script><script>…</script>
 * becomes live JavaScript on every product page (stored XSS; several
 * jsonLd fields are vendor-controlled).
 *
 * Escaping `<`, `>` and `&` to unicode escapes keeps the JSON identical
 * for every consumer (search engines parse \u003c fine) and makes
 * `</script>` breakout impossible.
 */
export const safeJsonLd = (value: unknown): string =>
  JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026");
