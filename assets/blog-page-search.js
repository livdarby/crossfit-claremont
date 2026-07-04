import { Component } from "@theme/component";

class BlogPageSearchComponent extends Component {
  /** @type {string} */
  #selectedTag = "all";

  /** @type {AbortController | null} */
  #abortController = null;

  /** @type {number | null} */
  #searchDebounceTimer = null;

  connectedCallback() {
    super.connectedCallback();
    this.addEventListener("click", this.#handleTagClick);
    window.addEventListener("popstate", this.#handlePopState);
    this.#hydrateFromUrl();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.removeEventListener("click", this.#handleTagClick);
    window.removeEventListener("popstate", this.#handlePopState);
    this.#abortController?.abort();
    if (this.#searchDebounceTimer) {
      window.clearTimeout(this.#searchDebounceTimer);
      this.#searchDebounceTimer = null;
    }
  }

  onInput(event) {
    if (!(event.target instanceof HTMLInputElement)) return;

    if (this.#searchDebounceTimer) {
      window.clearTimeout(this.#searchDebounceTimer);
    }

    this.#searchDebounceTimer = window.setTimeout(() => {
      this.#searchDebounceTimer = null;
      this.#runSearch(event.target.value);
    }, 500);
  }

  handleKeydown(event) {
    if (!(event.target instanceof HTMLInputElement)) return;
    if (event.key !== "Enter") return;

    event.preventDefault();
    if (this.#searchDebounceTimer) {
      window.clearTimeout(this.#searchDebounceTimer);
      this.#searchDebounceTimer = null;
    }
    this.#runSearch(event.target.value);
  }

  #hydrateFromUrl() {
    const url = new URL(window.location.href);
    const tag = url.searchParams.get("tag") ?? this.dataset.initialTag ?? "all";
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

    if (this.#selectedTag !== "all" || query.trim() !== "") {
      window.setTimeout(() => {
        this.#fetchArticles({
          tag: this.#selectedTag,
          query,
          basePath: this.#getCurrentPagePath(),
          updateHistory: false,
        });
      }, 0);
      return;
    }
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
        basePath: this.#getCurrentPagePath(),
        tag: nextTag,
        query,
      });
      if (query === "") {
        this.#emitChange(query);
        return;
      }

      this.#fetchArticles({
        tag: nextTag,
        query,
        basePath: this.#getCurrentPagePath(),
        updateHistory: false,
      });
      return;
    }

    this.#fetchArticles({
      tag: nextTag,
      query,
      basePath: this.#getCurrentPagePath(),
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

  #runSearch(queryOverride) {
    const input = this.querySelector('[ref="searchInput"]');
    const query =
      typeof queryOverride === "string"
        ? queryOverride
        : input instanceof HTMLInputElement
          ? input.value
          : "";
    const normalizedQuery = query.trim();
    const selectedPill =
      this.querySelector(
        `[data-tag-pill][data-tag-value="${CSS.escape(this.#selectedTag)}"][href]`,
      ) ?? this.querySelector('[data-tag-pill][href]');
    const basePath =
      this.#getCurrentPagePath() ||
      selectedPill?.getAttribute("href") ||
      window.location.pathname;

    if (normalizedQuery === "") {
      this.#updateHistory({ basePath, tag: this.#selectedTag, query: "" });
      if (this.#selectedTag === "all") {
        this.#emitChange("");
        return;
      }
    }

    this.#fetchArticles({
      tag: this.#selectedTag,
      query: normalizedQuery,
      basePath,
      updateHistory: true,
    });
  }

  async #fetchArticles({ tag, query, basePath, updateHistory }) {
    const blogHandle = this.dataset.blogHandle;
    const shopDomain = this.dataset.shopDomain;
    const token = this.dataset.storefrontApiToken;
    const apiVersion = this.dataset.storefrontApiVersion ?? "2025-01";
    const fetchLimit = Number(this.dataset.fetchLimit ?? "100");

    if (!blogHandle || !shopDomain || !token) {
      if (updateHistory) {
        this.#updateHistory({
          basePath: basePath ?? window.location.pathname,
          tag,
          query,
        });
      }
      this.#emitChange(query);
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
                      contentHtml
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
      const matchingArticles = articles
        .map((article) => {
          const plainContent = this.#stripHTML(String(article?.contentHtml ?? ""));
          const normalizedTitle = String(article?.title ?? "").toLowerCase();
          const normalizedContent = plainContent.toLowerCase();
          const tags = Array.isArray(article?.tags) ? article.tags : [];
          const matchesTag = tag === "all" || tags.some((articleTag) => this.#handleize(articleTag) === tag);
          const titleMatchIndex =
            normalizedQuery === "" ? 0 : normalizedTitle.indexOf(normalizedQuery);
          const contentMatchIndex =
            normalizedQuery === "" ? 0 : normalizedContent.indexOf(normalizedQuery);
          const matchesQuery =
            normalizedQuery === "" ||
            titleMatchIndex !== -1 ||
            contentMatchIndex !== -1;

          return {
            article: {
              ...article,
              contentHtml: plainContent,
            },
            matchesTag,
            matchesQuery,
            titleMatchIndex,
            contentMatchIndex,
          };
        })
        .filter(({ matchesTag, matchesQuery }) => matchesTag && matchesQuery)
        .sort((left, right) => {
          const leftTitleRank = left.titleMatchIndex === -1 ? Number.POSITIVE_INFINITY : left.titleMatchIndex;
          const rightTitleRank = right.titleMatchIndex === -1 ? Number.POSITIVE_INFINITY : right.titleMatchIndex;

          if (leftTitleRank !== rightTitleRank) {
            return leftTitleRank - rightTitleRank;
          }

          const leftContentRank =
            left.contentMatchIndex === -1 ? Number.POSITIVE_INFINITY : left.contentMatchIndex;
          const rightContentRank =
            right.contentMatchIndex === -1 ? Number.POSITIVE_INFINITY : right.contentMatchIndex;

          if (leftContentRank !== rightContentRank) {
            return leftContentRank - rightContentRank;
          }

          const leftPublishedAt = Date.parse(String(left.article?.publishedAt ?? "")) || 0;
          const rightPublishedAt = Date.parse(String(right.article?.publishedAt ?? "")) || 0;

          if (leftPublishedAt !== rightPublishedAt) {
            return rightPublishedAt - leftPublishedAt;
          }

          return String(left.article?.title ?? "").localeCompare(String(right.article?.title ?? ""));
        })
        .map(({ article }) => article);

      if (updateHistory) {
        this.#updateHistory({
          basePath: basePath ?? window.location.pathname,
          tag,
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
      this.#emitChange(query);
    } finally {
      this.removeAttribute("aria-busy");
      this.#abortController = null;
    }
  }

  #updateHistory({ basePath, tag, query }) {
    const url = new URL(basePath, window.location.origin);

    if (!tag || tag === "all") {
      url.searchParams.delete("tag");
    } else {
      url.searchParams.set("tag", tag);
    }

    if (query === "") {
      url.searchParams.delete("q");
    } else {
      url.searchParams.set("q", query);
    }

    url.searchParams.delete("page");
    window.history.pushState({}, "", url);
  }

  #handlePopState = () => {
    this.#hydrateFromUrl();
  };

  #getCurrentPagePath() {
    return window.location.pathname;
  }

  #handleize(value) {
    return String(value ?? "")
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  #stripHTML(value) {
    const template = document.createElement("template");
    template.innerHTML = value;
    return template.content.textContent?.replace(/\s+/g, " ").trim() ?? "";
  }
}

if (!customElements.get("blog-page-search-component")) {
  customElements.define("blog-page-search-component", BlogPageSearchComponent);
}
