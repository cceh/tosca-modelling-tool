import bigButtonStyles from "./big-button.component.scss"
import template from "./big-button.component.html"

export class BigButton extends HTMLElement {
  constructor() {
    super();

    this.attachShadow({ mode: 'open' });

    const templateEl = document.createElement("template")
    templateEl.innerHTML = template

    this.shadowRoot.adoptedStyleSheets = [bigButtonStyles]
    this.shadowRoot.appendChild(templateEl.content.cloneNode(true));
  }

  // connectedCallback() {
  //   const onClick = this.getAttribute('on-click');
  //   if (onClick) {
  //     this.shadowRoot.querySelector('.big-button').addEventListener('click', () => {
  //       eval(onClick);
  //     });
  //   }
  // }
}

