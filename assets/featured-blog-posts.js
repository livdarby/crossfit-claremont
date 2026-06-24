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

  connectedCallback() {
    super.connectedCallback();
    this.#resetFilterStateCache();
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

    if (tag === "all" && query === "") {
      this.#restoreDefaultGrid();
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

    const emptyState = this.querySelector('[ref="emptyState"]');
    if (emptyState instanceof HTMLElement) {
      emptyState.hidden = cards.length > 0;
    }

    const paginationNav = this.querySelector('[ref="paginationNav"]');
    if (paginationNav instanceof HTMLElement) {
      paginationNav.hidden = true;
    }
  }
}

if (!customElements.get("featured-blog-posts-component")) {
  customElements.define(
    "featured-blog-posts-component",
    FeaturedBlogPostsComponent,
  );
}
