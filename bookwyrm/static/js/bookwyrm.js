/* exported BookWyrm */
/* globals TabGroup */

let BookWyrm = new (class {
    constructor() {
        this.MAX_FILE_SIZE_BYTES = 10 * 1000000;
        this.initOnDOMLoaded();
        this.initReccuringTasks();
        this.initEventListeners();
    }

    initEventListeners() {
        document
            .querySelectorAll("[data-controls]")
            .forEach((button) => button.addEventListener("click", this.toggleAction.bind(this)));

        document
            .querySelectorAll(".interaction")
            .forEach((button) => button.addEventListener("submit", this.interact.bind(this)));

        document
            .querySelectorAll(".hidden-form input")
            .forEach((button) => button.addEventListener("change", this.revealForm.bind(this)));

        document
            .querySelectorAll("[data-hides]")
            .forEach((button) => button.addEventListener("change", this.hideForm.bind(this)));

        document
            .querySelectorAll("[data-back]")
            .forEach((button) => button.addEventListener("click", this.back));

        document
            .querySelectorAll('input[type="file"]')
            .forEach((node) => node.addEventListener("change", this.disableIfTooLarge.bind(this)));

        document
            .querySelectorAll("button[data-modal-open]")
            .forEach((node) => node.addEventListener("click", this.handleModalButton.bind(this)));

        document
            .querySelectorAll("[data-duplicate]")
            .forEach((node) => node.addEventListener("click", this.duplicateInput.bind(this)));

        document
            .querySelectorAll("details.dropdown")
            .forEach((node) =>
                node.addEventListener("toggle", this.handleDetailsDropdown.bind(this))
            );
    }

    /**
     * Execute code once the DOM is loaded.
     */
    initOnDOMLoaded() {
        const bookwyrm = this;

        window.addEventListener("DOMContentLoaded", function () {
            document.querySelectorAll(".tab-group").forEach((tabs) => new TabGroup(tabs));
            document
                .querySelectorAll('input[type="file"]')
                .forEach(bookwyrm.disableIfTooLarge.bind(bookwyrm));
            document.querySelectorAll("[data-copytext]").forEach(bookwyrm.copyText.bind(bookwyrm));
            document
                .querySelectorAll(".modal.is-active")
                .forEach(bookwyrm.handleActiveModal.bind(bookwyrm));
        });
    }

    /**
     * Execute recurring tasks.
     */
    initReccuringTasks() {
        // Polling
        document.querySelectorAll("[data-poll]").forEach((liveArea) => this.polling(liveArea));
    }

    /**
     * Go back in browser history.
     *
     * @param  {Event} event
     * @return {undefined}
     */
    back(event) {
        event.preventDefault();
        history.back();
    }

    /**
     * Update a counter with recurring requests to the API
     * The delay is slightly randomized and increased on each cycle.
     *
     * @param  {Object} counter - DOM node
     * @param  {int}    delay   - frequency for polling in ms
     * @return {undefined}
     */
    polling(counter, delay) {
        const bookwyrm = this;

        delay = delay || 10000;
        delay += Math.random() * 1000;

        setTimeout(
            function () {
                fetch("/api/updates/" + counter.dataset.poll)
                    .then((response) => response.json())
                    .then((data) => bookwyrm.updateCountElement(counter, data));

                bookwyrm.polling(counter, delay * 1.25);
            },
            delay,
            counter
        );
    }

    /**
     * Update a counter.
     *
     * @param  {object} counter - DOM node
     * @param  {object} data    - json formatted response from a fetch
     * @return {undefined}
     */
    updateCountElement(counter, data) {
        let count = data.count;
        const count_by_type = data.count_by_type;
        const currentCount = counter.innerText;
        const hasMentions = data.has_mentions;
        const allowedStatusTypesEl = document.getElementById("unread-notifications-wrapper");

        // If we're on the right counter element
        if (counter.closest("[data-poll-wrapper]").contains(allowedStatusTypesEl)) {
            const allowedStatusTypes = JSON.parse(allowedStatusTypesEl.textContent);

            // For keys in common between allowedStatusTypes and count_by_type
            // This concerns 'review', 'quotation', 'comment'
            count = allowedStatusTypes.reduce(function (prev, currentKey) {
                const currentValue = count_by_type[currentKey] | 0;

                return prev + currentValue;
            }, 0);

            // Add all the "other" in count_by_type if 'everything' is allowed
            if (allowedStatusTypes.includes("everything")) {
                // Clone count_by_type with 0 for reviews/quotations/comments
                const count_by_everything_else = Object.assign({}, count_by_type, {
                    review: 0,
                    quotation: 0,
                    comment: 0,
                });

                count = Object.keys(count_by_everything_else).reduce(function (prev, currentKey) {
                    const currentValue = count_by_everything_else[currentKey] | 0;

                    return prev + currentValue;
                }, count);
            }
        }

        if (count != currentCount) {
            this.addRemoveClass(counter.closest("[data-poll-wrapper]"), "is-hidden", count < 1);
            counter.innerText = count;
            this.addRemoveClass(counter.closest("[data-poll-wrapper]"), "is-danger", hasMentions);
        }
    }

    /**
     * Show form.
     *
     * @param  {Event} event
     * @return {undefined}
     */
    revealForm(event) {
        let trigger = event.currentTarget;
        let hidden = trigger.closest(".hidden-form").querySelectorAll(".is-hidden")[0];

        if (hidden) {
            this.addRemoveClass(hidden, "is-hidden", !hidden);
        }
    }

    /**
     * Hide form.
     *
     * @param  {Event} event
     * @return {undefined}
     */
    hideForm(event) {
        let trigger = event.currentTarget;
        let targetId = trigger.dataset.hides;
        let visible = document.getElementById(targetId);

        this.addRemoveClass(visible, "is-hidden", true);
    }

    /**
     * Execute actions on targets based on triggers.
     *
     * @param  {Event} event
     * @return {undefined}
     */
    toggleAction(event) {
        let trigger = event.currentTarget;

        if (!trigger.dataset.allowDefault || event.currentTarget == event.target) {
            event.preventDefault();
        }
        let pressed = trigger.getAttribute("aria-pressed") === "false";
        let targetId = trigger.dataset.controls;

        // Toggle pressed status on all triggers controlling the same target.
        document
            .querySelectorAll('[data-controls="' + targetId + '"]')
            .forEach((otherTrigger) =>
                otherTrigger.setAttribute(
                    "aria-pressed",
                    otherTrigger.getAttribute("aria-pressed") === "false"
                )
            );

        // @todo Find a better way to handle the exception.
        if (targetId && !trigger.classList.contains("pulldown-menu")) {
            let target = document.getElementById(targetId);

            this.addRemoveClass(target, "is-hidden", !pressed);
            this.addRemoveClass(target, "is-active", pressed);
        }

        // Show/hide pulldown-menus.
        if (trigger.classList.contains("pulldown-menu")) {
            this.toggleMenu(trigger, targetId);
        }

        // Show/hide container.
        let container = document.getElementById("hide_" + targetId);

        if (container) {
            this.toggleContainer(container, pressed);
        }

        // Check checkbox, if appropriate.
        let checkbox = trigger.dataset.controlsCheckbox;

        if (checkbox) {
            this.toggleCheckbox(checkbox, pressed);
        }

        // Toggle form disabled, if appropriate
        let disable = trigger.dataset.disables;

        if (disable) {
            this.toggleDisabled(disable, !pressed);
        }

        // Set focus, if appropriate.
        let focus = trigger.dataset.focusTarget;

        if (focus) {
            this.toggleFocus(focus);
        }

        return false;
    }

    /**
     * Show or hide menus.
     *
     * @param  {Event} event
     * @return {undefined}
     */
    toggleMenu(trigger, targetId) {
        let expanded = trigger.getAttribute("aria-expanded") == "false";

        trigger.setAttribute("aria-expanded", expanded);

        if (targetId) {
            let target = document.getElementById(targetId);

            this.addRemoveClass(target, "is-active", expanded);
        }
    }

    /**
     * Show or hide generic containers.
     *
     * @param  {object}  container - DOM node
     * @param  {boolean} pressed   - Is the trigger pressed?
     * @return {undefined}
     */
    toggleContainer(container, pressed) {
        this.addRemoveClass(container, "is-hidden", pressed);
    }

    /**
     * Check or uncheck a checkbox.
     *
     * @param  {string}  checkbox - id of the checkbox
     * @param  {boolean} pressed  - Is the trigger pressed?
     * @return {undefined}
     */
    toggleCheckbox(checkbox, pressed) {
        document.getElementById(checkbox).checked = !!pressed;
    }

    /**
     * Enable or disable a form element or fieldset
     *
     * @param  {string}  form_element - id of the element
     * @param  {boolean} pressed  - Is the trigger pressed?
     * @return {undefined}
     */
    toggleDisabled(form_element, pressed) {
        document.getElementById(form_element).disabled = !!pressed;
    }

    /**
     * Give the focus to an element.
     * Only move the focus based on user interactions.
     *
     * @param  {string} nodeId - ID of the DOM node to focus (button, link…)
     * @return {undefined}
     */
    toggleFocus(nodeId) {
        let node = document.getElementById(nodeId);

        node.focus();

        setTimeout(function () {
            node.selectionStart = node.selectionEnd = 10000;
        }, 0);
    }

    /**
     * Make a request and update the UI accordingly.
     * This function is used for boosts, favourites, follows and unfollows.
     *
     * @param  {Event} event
     * @return {undefined}
     */
    interact(event) {
        event.preventDefault();

        const bookwyrm = this;
        const form = event.currentTarget;
        const relatedforms = document.querySelectorAll(`.${form.dataset.id}`);

        // Toggle class on all related forms.
        relatedforms.forEach((relatedForm) =>
            bookwyrm.addRemoveClass(
                relatedForm,
                "is-hidden",
                relatedForm.className.indexOf("is-hidden") == -1
            )
        );

        this.ajaxPost(form).catch((error) => {
            // @todo Display a notification in the UI instead.
            console.warn("Request failed:", error);
        });
    }

    /**
     * Submit a form using POST.
     *
     * @param  {object} form - Form to be submitted
     * @return {Promise}
     */
    ajaxPost(form) {
        return fetch(form.action, {
            method: "POST",
            body: new FormData(form),
            headers: {
                Accept: "application/json",
            },
        });
    }

    /**
     * Add or remove a class based on a boolean condition.
     *
     * @param  {object}  node      - DOM node to change class on
     * @param  {string}  classname - Name of the class
     * @param  {boolean} add       - Add?
     * @return {undefined}
     */
    addRemoveClass(node, classname, add) {
        if (add) {
            node.classList.add(classname);
        } else {
            node.classList.remove(classname);
        }
    }

    disableIfTooLarge(eventOrElement) {
        const { addRemoveClass, MAX_FILE_SIZE_BYTES } = this;
        const element = eventOrElement.currentTarget || eventOrElement;

        const submits = element.form.querySelectorAll('[type="submit"]');
        const warns = element.parentElement.querySelectorAll(".file-too-big");
        const isTooBig =
            element.files && element.files[0] && element.files[0].size > MAX_FILE_SIZE_BYTES;

        if (isTooBig) {
            submits.forEach((submitter) => (submitter.disabled = true));
            warns.forEach((sib) => addRemoveClass(sib, "is-hidden", false));
        } else {
            submits.forEach((submitter) => (submitter.disabled = false));
            warns.forEach((sib) => addRemoveClass(sib, "is-hidden", true));
        }
    }

    /**
     * Handle the modal component with a button trigger.
     *
     * @param  {Event} event - Event fired by an element
     *                         with the `data-modal-open` attribute
     *                         pointing to a modal by its id.
     * @return {undefined}
     *
     * See https://github.com/bookwyrm-social/bookwyrm/pull/1633
     *  for information about using the modal.
     */
    handleModalButton(event) {
        const { handleFocusTrap } = this;
        const modalButton = event.currentTarget;
        const targetModalId = modalButton.dataset.modalOpen;
        const htmlElement = document.querySelector("html");
        const modal = document.getElementById(targetModalId);

        if (!modal) {
            return;
        }

        // Helper functions
        function handleModalOpen(modalElement) {
            event.preventDefault();

            htmlElement.classList.add("is-clipped");
            modalElement.classList.add("is-active");
            modalElement.getElementsByClassName("modal-card")[0].focus();

            const closeButtons = modalElement.querySelectorAll("[data-modal-close]");

            closeButtons.forEach((button) => {
                button.addEventListener("click", function () {
                    handleModalClose(modalElement);
                });
            });

            document.addEventListener("keydown", function (event) {
                if (event.key === "Escape") {
                    handleModalClose(modalElement);
                }
            });

            modalElement.addEventListener("keydown", handleFocusTrap);
        }

        function handleModalClose(modalElement) {
            modalElement.removeEventListener("keydown", handleFocusTrap);
            htmlElement.classList.remove("is-clipped");
            modalElement.classList.remove("is-active");
            modalButton.focus();
        }

        // Open modal
        handleModalOpen(modal);
    }

    /**
     * Handle the modal component when opened at page load.
     *
     * @param  {Element} modalElement - Active modal element
     * @return {undefined}
     *
     */
    handleActiveModal(modalElement) {
        if (!modalElement) {
            return;
        }

        const { handleFocusTrap } = this;

        modalElement.getElementsByClassName("modal-card")[0].focus();

        const closeButtons = modalElement.querySelectorAll("[data-modal-close]");

        closeButtons.forEach((button) => {
            button.addEventListener("click", function () {
                handleModalClose(modalElement);
            });
        });

        document.addEventListener("keydown", function (event) {
            if (event.key === "Escape") {
                handleModalClose(modalElement);
            }
        });

        modalElement.addEventListener("keydown", handleFocusTrap);

        function handleModalClose(modalElement) {
            modalElement.removeEventListener("keydown", handleFocusTrap);
            history.back();
        }
    }

    /**
     * Display pop up window.
     *
     * @param {string} url Url to open
     * @param {string} windowName windowName
     * @return {undefined}
     */
    displayPopUp(url, windowName) {
        window.open(url, windowName, "left=100,top=100,width=430,height=600");
    }

    duplicateInput(event) {
        const trigger = event.currentTarget;
        const input_id = trigger.dataset["duplicate"];
        const orig = document.getElementById(input_id);
        const parent = orig.parentNode;
        const new_count = parent.querySelectorAll("input").length + 1;

        let input = orig.cloneNode();

        input.id += "-" + new_count;
        input.value = "";

        let label = parent.querySelector("label").cloneNode();

        label.setAttribute("for", input.id);

        parent.appendChild(label);
        parent.appendChild(input);
    }

    /**
     * Set up a "click-to-copy" component from a textarea element
     * with `data-copytext`, `data-copytext-label`, `data-copytext-success`
     * attributes.
     *
     * @param  {object}  node - DOM node of the text container
     * @return {undefined}
     */

    copyText(textareaEl) {
        const text = textareaEl.textContent;

        const copyButtonEl = document.createElement("button");

        copyButtonEl.textContent = textareaEl.dataset.copytextLabel;
        copyButtonEl.classList.add("button", "is-small", "is-primary", "is-light");
        copyButtonEl.addEventListener("click", () => {
            navigator.clipboard.writeText(text).then(function () {
                textareaEl.classList.add("is-success");
                copyButtonEl.classList.replace("is-primary", "is-success");
                copyButtonEl.textContent = textareaEl.dataset.copytextSuccess;
            });
        });

        textareaEl.parentNode.appendChild(copyButtonEl);
    }

    /**
     * Handle the details dropdown component.
     *
     * @param  {Event} event - Event fired by a `details` element
     *                         with the `dropdown` class name, on toggle.
     * @return {undefined}
     */
    handleDetailsDropdown(event) {
        const detailsElement = event.target;
        const summaryElement = detailsElement.querySelector("summary");
        const menuElement = detailsElement.querySelector(".dropdown-menu");
        const htmlElement = document.querySelector("html");

        if (detailsElement.open) {
            // Focus first menu element
            menuElement
                .querySelectorAll("a[href]:not([disabled]), button:not([disabled])")[0]
                .focus();

            // Enable focus trap
            menuElement.addEventListener("keydown", this.handleFocusTrap);

            // Close on Esc
            detailsElement.addEventListener("keydown", handleEscKey);

            // Clip page if Mobile
            if (this.isMobile()) {
                htmlElement.classList.add("is-clipped");
            }
        } else {
            summaryElement.focus();

            // Disable focus trap
            menuElement.removeEventListener("keydown", this.handleFocusTrap);

            // Unclip page
            if (this.isMobile()) {
                htmlElement.classList.remove("is-clipped");
            }
        }

        function handleEscKey(event) {
            if (event.key !== "Escape") {
                return;
            }

            summaryElement.click();
        }
    }

    /**
     * Check if windows matches mobile media query.
     *
     * @return {Boolean}
     */
    isMobile() {
        return window.matchMedia("(max-width: 768px)").matches;
    }

    /**
     * Focus trap handler
     *
     * @param  {Event} event - Keydown event.
     * @return {undefined}
     */
    handleFocusTrap(event) {
        if (event.key !== "Tab") {
            return;
        }

        const focusableEls = event.currentTarget.querySelectorAll(
            [
                "a[href]:not([disabled])",
                "button:not([disabled])",
                "textarea:not([disabled])",
                'input:not([type="hidden"]):not([disabled])',
                "select:not([disabled])",
                "details:not([disabled])",
                '[tabindex]:not([tabindex="-1"]):not([disabled])',
            ].join(",")
        );
        const firstFocusableEl = focusableEls[0];
        const lastFocusableEl = focusableEls[focusableEls.length - 1];

        if (event.shiftKey) {
            /* Shift + tab */ if (document.activeElement === firstFocusableEl) {
                lastFocusableEl.focus();
                event.preventDefault();
            }
        } /* Tab */ else {
            if (document.activeElement === lastFocusableEl) {
                firstFocusableEl.focus();
                event.preventDefault();
            }
        }
    }
})();
