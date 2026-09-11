const url = process.env.NEXT_PUBLIC_SITE_URL;

if (!url) {
  throw new Error("NEXT_PUBLIC_SITE_URL em falta no .env.local");
}

export const siteUrl = url;
