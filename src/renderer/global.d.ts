// add Constructable Stylesheet definitions
// which are not part of the dom library yet

export declare global {
    interface Document {
        adoptedStyleSheets: readonly CSSStyleSheet[];
    }

    interface ShadowRoot {
        adoptedStyleSheets: readonly CSSStyleSheet[];
    }
}
