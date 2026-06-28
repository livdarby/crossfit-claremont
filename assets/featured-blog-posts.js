import { Component } from "@theme/component";
import { sectionRenderer } from "@theme/section-renderer";

/**
 * AJAX pagination for featured blog posts sections.
 */
class FeaturedBlogPostsComponent extends Component {
  /** @type {AbortController | null} */
  #abortController = null;

  /** @type {{ tags: string[], title: string, html: string }[] | null} */
  #allPageCards = null;

  /** @type {string | null} */
  #defaultGridHTML = null;

  /** @type {boolean} */
  #defaultEmptyStateHidden = true;

  /** @type {boolean} */
  #defaultPaginationHidden = false;

  /** @type {{ tags: string[], title: string, html: string }[] | null} */
  #storefrontCards = null;

  connectedCallback() {
    super.connectedCallback();
    this.#resetFilterStateCache();
    this.#enhanceCards();
    document.addEventListener(
      "blog-page-search:change",
      this.#handleSearchChange,
    );
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    document.removeEventListener(
      "blog-page-search:change",
      this.#handleSearchChange,
    );
  }

  /**
   * Handles pagination link clicks and morphs just this section.
   *
   * @param {Record<string, string | number>} params
   * @param {Event} event
   */
  async paginateBlogCards(params, event) {
    event.preventDefault();

    const sectionId = this.getAttribute("section-id");
    if (!sectionId) return;

    const page = params.page ? String(params.page) : "1";
    const url = new URL(window.location.href);
    url.searchParams.set("page", page);
    const renderUrl = new URL(url.toString());

    this.#abortController?.abort();
    this.#abortController = new AbortController();

    this.setAttribute("aria-busy", "true");

    try {
      await sectionRenderer.renderSection(sectionId, {
        cache: false,
        url: renderUrl,
      });

      this.#resetFilterStateCache();
      this.#enhanceCards();
      history.pushState({}, "", url);
    } catch (error) {
      if (error.name !== "AbortError") {
        window.location.href = url.toString();
      }
    } finally {
      this.removeAttribute("aria-busy");
      this.#abortController = null;
    }
  }

  #handleSearchChange = async (event) => {
    const tag = event.detail?.tag ?? "all";
    const query = (event.detail?.query ?? "").trim();
    const storefrontArticles = Array.isArray(event.detail?.articles)
      ? event.detail.articles
      : null;

    if (tag === "all") {
      this.#storefrontCards = null;

      if (query === "") {
        this.#restoreDefaultGrid();
        return;
      }

      this.#filterCards({ tag, query });
      return;
    }

    if (storefrontArticles) {
      this.#storefrontCards = storefrontArticles.map((article) =>
        this.#mapStorefrontArticleToCard(article),
      );
      this.#renderFilteredCards(this.#storefrontCards);
      return;
    }

    if (this.#storefrontCards) {
      const normalizedQuery = query.toLowerCase();
      const matchingCards = this.#storefrontCards.filter((card) => {
        const matchesTag = tag === "all" || card.tags.includes(tag);
        const matchesQuery =
          normalizedQuery === "" ||
          card.title.toLowerCase().includes(normalizedQuery);

        return matchesTag && matchesQuery;
      });

      this.#renderFilteredCards(matchingCards);
      return;
    }

    this.#filterCards({ tag, query });
  };

  #restoreDefaultGrid() {
    this.#cacheDefaultState();

    const grid = this.querySelector('.resource-list[data-testid="featured-blog-posts"]');
    if (!(grid instanceof HTMLElement) || this.#defaultGridHTML == null) return;

    grid.innerHTML = this.#defaultGridHTML;
    this.removeAttribute("data-filtered");
    this.#enhanceCards();

    const emptyState = this.querySelector('[ref="emptyState"]');
    if (emptyState instanceof HTMLElement) {
      emptyState.hidden = this.#defaultEmptyStateHidden;
    }

    const paginationNav = this.querySelector('[ref="paginationNav"]');
    if (paginationNav instanceof HTMLElement) {
      paginationNav.hidden = this.#defaultPaginationHidden;
    }
  }

  async #filterCards({ tag, query }) {
    this.#cacheDefaultState();

    this.setAttribute("aria-busy", "true");

    try {
      const cards = await this.#getAllPageCards();
      const normalizedQuery = query.toLowerCase();
      const matchingCards = cards.filter((card) => {
        const matchesTag = tag === "all" || card.tags.includes(tag);
        const matchesQuery =
          normalizedQuery === "" ||
          card.title.toLowerCase().includes(normalizedQuery);

        return matchesTag && matchesQuery;
      });

      this.#renderFilteredCards(matchingCards);
    } finally {
      this.removeAttribute("aria-busy");
    }
  }

  #cacheDefaultState() {
    if (this.#defaultGridHTML != null) return;

    const grid = this.querySelector('.resource-list[data-testid="featured-blog-posts"]');
    if (!(grid instanceof HTMLElement)) return;

    this.#defaultGridHTML = grid.innerHTML;

    const emptyState = this.querySelector('[ref="emptyState"]');
    if (emptyState instanceof HTMLElement) {
      this.#defaultEmptyStateHidden = emptyState.hidden;
    }

    const paginationNav = this.querySelector('[ref="paginationNav"]');
    if (paginationNav instanceof HTMLElement) {
      this.#defaultPaginationHidden = paginationNav.hidden;
    }
  }

  async #getAllPageCards() {
    if (this.#allPageCards) return this.#allPageCards;

    const totalPages = this.#getTotalPages();
    const cards = [];

    for (let page = 1; page <= totalPages; page += 1) {
      if (page === this.#getCurrentPage()) {
        cards.push(...this.#extractCardsFromElement(this));
        continue;
      }

      const url = new URL(window.location.href);
      url.searchParams.set("page", String(page));

      const sectionHTML = await sectionRenderer.getSectionHTML(
        this.getAttribute("section-id"),
        false,
        url,
      );

      cards.push(...this.#extractCardsFromHTML(sectionHTML));
    }

    this.#allPageCards = cards;
    return cards;
  }

  #getCurrentPage() {
    const paginationNav = this.querySelector('[ref="paginationNav"]');
    const currentPage = paginationNav?.dataset.current_page;
    return currentPage ? Number(currentPage) : 1;
  }

  #getTotalPages() {
    const paginationMeta = this.querySelector('[ref="paginationMeta"]');
    const totalPages = paginationMeta?.dataset.totalPages;
    return totalPages ? Number(totalPages) : 1;
  }

  #resetFilterStateCache() {
    this.#allPageCards = null;
    this.#defaultGridHTML = null;
    this.#defaultEmptyStateHidden = true;
    this.#defaultPaginationHidden = false;
    this.#storefrontCards = null;
  }

  /**
   * @param {string} html
   */
  #extractCardsFromHTML(html) {
    const fragment = new DOMParser().parseFromString(html, "text/html");
    const component = fragment.querySelector(
      `featured-blog-posts-component[section-id="${this.getAttribute("section-id")}"]`,
    );

    return this.#extractCardsFromElement(component);
  }

  /**
   * @param {ParentNode | null} root
   */
  #extractCardsFromElement(root) {
    if (!root) return [];

    const grid = root.querySelector('.resource-list[data-testid="featured-blog-posts"]');
    if (!grid) return [];

    return Array.from(grid.querySelectorAll(".resource-list__item"))
      .filter((card) => card instanceof HTMLElement)
      .map((card) => ({
        tags: (card.dataset.tags ?? "")
          .split("|")
          .map((tag) => tag.trim())
          .filter(Boolean),
        title: card.dataset.title ?? "",
        html: card.outerHTML,
      }));
  }

  /**
   * @param {{ tags: string[], title: string, html: string }[]} cards
   */
  #renderFilteredCards(cards) {
    const grid = this.querySelector('.resource-list[data-testid="featured-blog-posts"]');
    if (!(grid instanceof HTMLElement)) return;

    this.setAttribute("data-filtered", "true");
    grid.innerHTML = cards.map((card) => card.html).join("");
    this.#enhanceCards();

    const emptyState = this.querySelector('[ref="emptyState"]');
    if (emptyState instanceof HTMLElement) {
      emptyState.hidden = cards.length > 0;
    }

    const paginationNav = this.querySelector('[ref="paginationNav"]');
    if (paginationNav instanceof HTMLElement) {
      paginationNav.hidden = true;
    }
  }

  /**
   * @param {{
   *   title?: string,
   *   tags?: string[],
   *   excerpt?: string,
   *   publishedAt?: string,
   *   onlineStoreUrl?: string,
   *   handle?: string,
   *   image?: { url?: string, altText?: string | null }
   * }} article
   */
  #mapStorefrontArticleToCard(article) {
    const tags = Array.isArray(article?.tags)
      ? article.tags
          .map((tag) => this.#handleize(tag))
          .filter(Boolean)
      : [];
    const title = String(article?.title ?? "");
    const url =
      article?.onlineStoreUrl ||
      (article?.handle ? `/blogs/${this.#getBlogHandle()}/${article.handle}` : "#");
    const excerpt = this.#escapeHTML(String(article?.excerpt ?? ""));
    const date = article?.publishedAt
      ? new Intl.DateTimeFormat(undefined, {
          month: "long",
          day: "numeric",
          year: "numeric",
        }).format(new Date(article.publishedAt))
      : "";
    const buttonLabel = this.dataset.buttonLabel ?? "Read more";
    const image = article?.image?.url
      ? `
        <div class="featured-blog-posts-card__image">
          <img
            class="resource-image__image"
            src="${this.#escapeAttribute(article.image.url)}"
            alt="${this.#escapeAttribute(article.image.altText || title)}"
            loading="lazy"
          >
        </div>
      `
      : `
        <div class="featured-blog-posts-card__image featured-blog-posts-card__image--placeholder">
          <span>No image</span>
        </div>
      `;

    return {
      tags,
      title,
      html: `
        <div
          class="resource-list__item"
          data-tags="${this.#escapeAttribute(tags.join("|"))}"
          data-title="${this.#escapeAttribute(title)}"
        >
          <article class="featured-blog-posts-card featured-blog-posts-card--api">
            <div class="featured-blog-posts-card__inner">
              ${image}
              <div class="featured-blog-posts-card__content featured-blog-posts-card__content--api">
                ${date ? `<p class="featured-blog-posts-card__meta">${this.#escapeHTML(date)}</p>` : ""}
                <h4 class="featured-blog-posts-card__title">${this.#escapeHTML(title)}</h4>
                ${excerpt ? `<p class="featured-blog-posts-card__excerpt">${excerpt}</p>` : ""}
                <span class="button-secondary featured-blog-posts-card__button">${this.#escapeHTML(buttonLabel)}</span>
              </div>
              <a class="featured-blog-posts-card__link" href="${this.#escapeAttribute(url)}" aria-label="${this.#escapeAttribute(title)}"></a>
            </div>
          </article>
        </div>
      `,
    };
  }

  #getBlogHandle() {
    const search = document.querySelector("blog-page-search-component");
    return search?.dataset.blogHandle ?? "";
  }

  #handleize(value) {
    return String(value ?? "")
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  #escapeHTML(value) {
    return value
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  #escapeAttribute(value) {
    return this.#escapeHTML(String(value ?? ""));
  }

  #enhanceCards() {
    for (const card of this.querySelectorAll(".resource-list__item")) {
      if (!(card instanceof HTMLElement)) continue;

      const title = card.querySelector("h4");
      if (title instanceof HTMLElement) {
        title.classList.add("featured-blog-posts-card__title");
      }

      if (card.dataset.hasExcerpt !== "false") continue;

      const fallbackExcerpt = (card.dataset.fallbackExcerpt ?? "").trim();
      if (fallbackExcerpt === "") continue;

      const content = card.querySelector(".featured-blog-posts-card__content");
      if (!(content instanceof HTMLElement)) continue;

      const emptyExcerptContainer = content.querySelector(".blog-post-card__content-text");
      if (
        emptyExcerptContainer instanceof HTMLElement &&
        emptyExcerptContainer.textContent?.trim() === ""
      ) {
        emptyExcerptContainer.classList.add("featured-blog-posts-card__excerpt--fallback");
        emptyExcerptContainer.innerHTML = `<p>${this.#escapeHTML(this.#decodeHTML(fallbackExcerpt))}</p>`;
        continue;
      }

      const existingFallback = content.querySelector(".featured-blog-posts-card__excerpt--fallback");
      if (existingFallback) continue;

      const fallbackNode = this.#createFallbackExcerptNode(card, fallbackExcerpt);
      if (!fallbackNode) continue;

      const button = content.querySelector(".button, .button-secondary");
      if (button instanceof HTMLElement) {
        content.insertBefore(fallbackNode, button);
      } else {
        content.appendChild(fallbackNode);
      }
    }
  }

  /**
   * @param {HTMLElement} card
   * @param {string} fallbackExcerpt
   */
  #createFallbackExcerptNode(card, fallbackExcerpt) {
    const decodedExcerpt = this.#decodeHTML(fallbackExcerpt);
    const excerptTemplate = this.#findExcerptTemplate(card);

    if (excerptTemplate instanceof HTMLElement) {
      const clone = excerptTemplate.cloneNode(true);
      clone.classList.add("featured-blog-posts-card__excerpt--fallback");

      if (clone.matches("rte-formatter")) {
        clone.innerHTML = `<p>${this.#escapeHTML(decodedExcerpt)}</p>`;
        return clone;
      }

      const paragraph = clone.querySelector("p");
      if (paragraph instanceof HTMLElement) {
        paragraph.textContent = decodedExcerpt;
      } else {
        clone.textContent = decodedExcerpt;
      }

      return clone;
    }

    const fallbackNode = document.createElement("p");
    fallbackNode.className = "featured-blog-posts-card__excerpt featured-blog-posts-card__excerpt--fallback";
    fallbackNode.textContent = decodedExcerpt;
    return fallbackNode;
  }

  /**
   * @param {HTMLElement} card
   */
  #findExcerptTemplate(card) {
    const siblingTemplate = card.parentElement?.querySelector(
      ".resource-list__item:not([data-has-excerpt='false']) .featured-blog-posts-card__content > .rte, .resource-list__item:not([data-has-excerpt='false']) .featured-blog-posts-card__content > .featured-blog-posts-card__excerpt",
    );
    if (siblingTemplate instanceof HTMLElement) {
      return siblingTemplate;
    }

    const componentTemplate = this.querySelector(
      ".featured-blog-posts-card__content > .rte, .featured-blog-posts-card__content > .featured-blog-posts-card__excerpt",
    );
    if (componentTemplate instanceof HTMLElement) {
      return componentTemplate;
    }

    return null;
  }

  #decodeHTML(value) {
    const textarea = document.createElement("textarea");
    textarea.innerHTML = value;
    return textarea.value;
  }
}

if (!customElements.get("featured-blog-posts-component")) {
  customElements.define(
    "featured-blog-posts-component",
    FeaturedBlogPostsComponent,
  );
}
