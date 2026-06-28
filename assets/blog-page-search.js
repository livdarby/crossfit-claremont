import { Component } from "@theme/component";

class BlogPageSearchComponent extends Component {
  /** @type {string} */
  #selectedTag = "all";

  /** @type {AbortController | null} */
  #abortController = null;

  connectedCallback() {
    super.connectedCallback();
    this.addEventListener("click", this.#handleTagClick);
    this.#hydrateFromUrl();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.removeEventListener("click", this.#handleTagClick);
    this.#abortController?.abort();
  }

  onInput() {}

  handleKeydown(event) {
    if (!(event.target instanceof HTMLInputElement)) return;
    if (event.key !== "Enter") return;

    event.preventDefault();
    this.#navigate(event.target.value);
  }

  #hydrateFromUrl() {
    const url = new URL(window.location.href);
    const tag = this.dataset.initialTag ?? "all";
    const query = url.searchParams.get("q") ?? "";

    this.#selectedTag = tag;

    const input = this.querySelector('[ref="searchInput"]');
    if (input instanceof HTMLInputElement) {
      input.value = query;
    }

    for (const pill of this.querySelectorAll("[data-tag-pill]")) {
      if (!(pill instanceof HTMLElement)) continue;
      pill.classList.toggle(
        "blog-page-search__tag-pill--selected",
        (pill.dataset.tagValue ?? "all") === this.#selectedTag,
      );
    }

    if (this.#selectedTag !== "all") {
      window.setTimeout(() => {
        this.#fetchTaggedArticles({
          tag: this.#selectedTag,
          query,
          updateHistory: false,
        });
      }, 0);
      return;
    }

    if (query.trim() !== "") {
      window.setTimeout(() => {
        this.#emitChange(query);
      }, 0);
    }
  }

  #navigate(queryOverride) {
    const input = this.querySelector('[ref="searchInput"]');
    const query =
      typeof queryOverride === "string"
        ? queryOverride
        : input instanceof HTMLInputElement
          ? input.value
          : "";

    const selectedPill =
      this.querySelector(
        `[data-tag-pill][data-tag-value="${CSS.escape(this.#selectedTag)}"][href]`,
      ) ?? this.querySelector('[data-tag-pill][href]');
    const blogPath =
      selectedPill?.getAttribute("href") ?? window.location.pathname;
    const url = new URL(blogPath, window.location.origin);
    const normalizedQuery = query.trim();

    if (normalizedQuery === "") {
      url.searchParams.delete("q");
    } else {
      url.searchParams.set("q", normalizedQuery);
    }

    url.searchParams.delete("page");

    if (url.toString() === window.location.href) {
      this.#emitChange(normalizedQuery);
      return;
    }

    window.location.assign(url.toString());
  }

  #emitChange(queryOverride) {
    const input = this.querySelector('[ref="searchInput"]');
    const query =
      typeof queryOverride === "string"
        ? queryOverride
        : input instanceof HTMLInputElement
          ? input.value
          : "";

    document.dispatchEvent(
      new CustomEvent("blog-page-search:change", {
        detail: {
          tag: this.#selectedTag,
          query: query.trim(),
        },
      }),
    );
  }

  #handleTagClick = (event) => {
    const pill = event.target instanceof Element ? event.target.closest("[data-tag-pill]") : null;
    if (!(pill instanceof HTMLAnchorElement)) return;

    event.preventDefault();

    const nextTag = pill.dataset.tagValue ?? "all";
    const input = this.querySelector('[ref="searchInput"]');
    const query = input instanceof HTMLInputElement ? input.value.trim() : "";

    this.#selectedTag = nextTag;
    this.#syncSelectedPill();

    if (nextTag === "all") {
      this.#updateHistory({
        basePath: pill.getAttribute("href") ?? window.location.pathname,
        query,
      });
      this.#emitChange(query);
      return;
    }

    this.#fetchTaggedArticles({
      tag: nextTag,
      query,
      href: pill.href,
      updateHistory: true,
    });
  };

  #syncSelectedPill() {
    for (const pill of this.querySelectorAll("[data-tag-pill]")) {
      if (!(pill instanceof HTMLElement)) continue;
      pill.classList.toggle(
        "blog-page-search__tag-pill--selected",
        (pill.dataset.tagValue ?? "all") === this.#selectedTag,
      );
    }
  }

  async #fetchTaggedArticles({ tag, query, href, updateHistory }) {
    const blogHandle = this.dataset.blogHandle;
    const shopDomain = this.dataset.shopDomain;
    const token = this.dataset.storefrontApiToken;
    const apiVersion = this.dataset.storefrontApiVersion ?? "2025-01";
    const fetchLimit = Number(this.dataset.fetchLimit ?? "100");

    if (!blogHandle || !shopDomain || !token) {
      if (href) {
        window.location.assign(href);
      }
      return;
    }

    this.#abortController?.abort();
    this.#abortController = new AbortController();
    this.setAttribute("aria-busy", "true");

    try {
      const response = await fetch(
        `https://${shopDomain}/api/${apiVersion}/graphql.json`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Shopify-Storefront-Access-Token": token,
          },
          body: JSON.stringify({
            query: `
              query BlogArticlesByHandle($blogHandle: String!, $first: Int!) {
                blog(handle: $blogHandle) {
                  articles(first: $first, sortKey: PUBLISHED_AT, reverse: true) {
                    nodes {
                      title
                      handle
                      tags
                      excerpt
                      publishedAt
                      onlineStoreUrl
                      image {
                        url
                        altText
                        width
                        height
                      }
                    }
                  }
                }
              }
            `,
            variables: {
              blogHandle,
              first: fetchLimit,
            },
          }),
          signal: this.#abortController.signal,
        },
      );

      if (!response.ok) {
        throw new Error(`Storefront API request failed with ${response.status}`);
      }

      const payload = await response.json();
      if (Array.isArray(payload?.errors) && payload.errors.length > 0) {
        throw new Error(payload.errors[0]?.message ?? "Storefront API error");
      }

      const articles = payload?.data?.blog?.articles?.nodes ?? [];
      const normalizedQuery = query.toLowerCase();
      const matchingArticles = articles.filter((article) => {
        const tags = Array.isArray(article?.tags) ? article.tags : [];
        const matchesTag = tags.some((articleTag) => this.#handleize(articleTag) === tag);
        const matchesQuery =
          normalizedQuery === "" ||
          String(article?.title ?? "").toLowerCase().includes(normalizedQuery);

        return matchesTag && matchesQuery;
      });

      if (updateHistory) {
        this.#updateHistory({
          basePath: href ?? window.location.pathname,
          query,
        });
      }

      document.dispatchEvent(
        new CustomEvent("blog-page-search:change", {
          detail: {
            source: "storefront",
            tag,
            query,
            articles: matchingArticles,
          },
        }),
      );
    } catch (error) {
      if (error.name === "AbortError") return;

      if (href) {
        window.location.assign(href);
      }
    } finally {
      this.removeAttribute("aria-busy");
      this.#abortController = null;
    }
  }

  #updateHistory({ basePath, query }) {
    const url = new URL(basePath, window.location.origin);

    if (query === "") {
      url.searchParams.delete("q");
    } else {
      url.searchParams.set("q", query);
    }

    url.searchParams.delete("page");
    window.history.pushState({}, "", url);
  }

  #handleize(value) {
    return String(value ?? "")
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }
}

if (!customElements.get("blog-page-search-component")) {
  customElements.define("blog-page-search-component", BlogPageSearchComponent);
}
