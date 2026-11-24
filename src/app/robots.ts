import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/sections";

/** Keep crawlers off private party links and admin pages. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/drop/", "/nights", "/api/", "/new", "/crew", "/login", "/takedown"],
    },
    host: SITE_URL,
  };
}
