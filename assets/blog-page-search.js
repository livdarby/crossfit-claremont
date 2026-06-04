import { Component } from "@theme/component";
import { debounce } from "@theme/utilities";

class BlogPageSearchComponent extends Component {
  /** @type {string} */
  #selectedTag = "all";

  /**
   * Toggles the selected pill state.
   *
   * @param {Event} event
   */
  selectTag(event) {
    event.preventDefault();

    const target = event.target;
    if (!(target instanceof HTMLElement)) return;

    const pill = target.closest("[data-tag-pill]");
    if (!(pill instanceof HTMLElement)) return;

    for (const selectedPill of this.querySelectorAll(
      ".blog-page-search__tag-pill--selected",
    )) {
      selectedPill.classList.remove("blog-page-search__tag-pill--selected");
    }

    pill.classList.add("blog-page-search__tag-pill--selected");
    this.#selectedTag = pill.dataset.tagValue ?? "all";
    this.#emitChange();
  }

  onInput = debounce((event) => {
    if (!(event.target instanceof HTMLInputElement)) return;
    this.#emitChange(event.target.value);
  }, 200);

  handleKeydown(event) {
    if (!(event.target instanceof HTMLInputElement)) return;
    if (event.key !== "Enter") return;

    event.preventDefault();
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
}

if (!customElements.get("blog-page-search-component")) {
  customElements.define("blog-page-search-component", BlogPageSearchComponent);
}
