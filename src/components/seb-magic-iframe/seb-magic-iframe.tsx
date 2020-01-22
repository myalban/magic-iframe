import {Component, EventEmitter, h, Host, Prop, State, Watch} from '@stencil/core';
import elementResizeDetectorMaker from 'element-resize-detector';
import {sanitizeUrl} from '@braintree/sanitize-url';
import {forkJoin, Subject} from 'rxjs';
import {MagicIframeEvent} from "./seb-magic-iframe-event.interface";

const erd = elementResizeDetectorMaker({
  strategy: "scroll"
});


@Component({
  tag: 'seb-magic-iframe',
  styleUrl: 'seb-magic-iframe.css',
  shadow: true
})
export class SebMagicIframe {

  iframe!: HTMLIFrameElement;
  styleElement: HTMLStyleElement;

  /**
   * Properties
   *
   */

  @Prop() source: string;
  @Prop() styles: string;
  @Prop() styleUrls: Array<string>;
  @Prop() autoResize: boolean = true;
  @Prop() resizeDebounce: number = 0;
  @Prop() scaleDebounce: number = 0;
  @Prop() matchContentWidth: boolean | 'auto' = false;
  @Prop() scaleContent: boolean = true;
  @Prop() height: string;
  @Prop() minWidth: string;
  @Prop() sanitizeSource: boolean = true;
  @Prop() debug: boolean = false;

  /**
   * Watchers
   *
   */
  @Watch('source')
  sourceChangeHandler(newValue: boolean, oldValue: boolean) {
    if(newValue !== oldValue){ this.loaded = false; }
  }

  @Watch('scaleContent')
  scaleContentChangeHandler(newValue: boolean, oldValue: boolean) {
    if(newValue !== oldValue){
      this.scale();
      // scale content is true...
      if(newValue) {
        // ...set match content width to false (we can't match and scale at the same time).
        this.matchContentWidth = false;
      }
    }
  }

  @Watch('styles')
  stylesChangeHandler(newValue: boolean, oldValue: boolean) {
    if(newValue !== oldValue){
      this.addCss();
    }
  }

  @Watch('styleUrls')
  styleUrlsChangeHandler(newValue: boolean, oldValue: boolean) {
    if(newValue !== oldValue){
      this.addStyleSheets();
    }
  }

  @Watch('autoResize')
  autoResizeChangeHandler(newValue: boolean, oldValue: boolean) {
    if(newValue !== oldValue){
      //this.addStyleSheets();
      // if falsy...
      if(!newValue) {
        this.removeElementResizeDetector();
      } else if(this.iframe.contentDocument.body.getElementsByClassName('erd_scroll_detection_container').length === 0) {
        this.addElementResizeDetector(this.iframe.contentDocument.body, this.iframe.contentWindow.getComputedStyle(this.iframe.contentDocument.body));
      }
    }
  }

  @Watch('matchContentWidth')
  matchContentWidthChangeHandler(newValue: boolean, oldValue: boolean) {
    if(newValue !== oldValue) {
      this.hasBodyWidthRule();
    }
  }

  @Watch('loaded')
  loadedHandler(newValue: boolean, oldValue: boolean) {
    if(newValue !== oldValue && newValue){

      // prevent overflow for iframe body
      const error = this.preventOverflow();
      if(error) {
        return;
      }
      this.magicIframeEventHandler({event:'iframe-loaded', details: this._loadEvent});

      this.addCss();
      // add external stylesheets
      this.addStyleSheets();
      if(this.autoResize) {
        this.addElementResizeDetector(this.iframe.contentDocument.body, this.iframe.contentWindow.getComputedStyle(this.iframe.contentDocument.body));
      }
      this.addUnloadListener();
      this.addClickListener();
      this.addKeyUpListener();
      this.scale();
    } else {
      this.loading = true;
    }
  }

  // @ts-ignore
  @Event() magicIframeEvent: EventEmitter<MagicIframeEvent>;
  magicIframeEventHandler(event: MagicIframeEvent) {
    if (this.debug) {
      console.log(event);
    }
    this.magicIframeEvent.emit(event);
  }

  onIframeLoad($event: any) {
    this._loadEvent = $event;
    this.loaded = true;
  }
  @State() loaded: boolean = false;
  @State() loading: boolean = true;

  private _loadEvent: Event;
  private _previousScale: number;
  private _scale: number = 1;
  private _hasBodyWidthRule = false;
  private _resizeListener: EventListener;
  private _styleElement: HTMLStyleElement;
  private _stylesheets: Array<HTMLLinkElement> = [];
  private _resizeDebounceTimeout: number;
  private _scaleDebounceTimeout: number;

  getSafeSrc(): string {
    return this.sanitizeSource ? sanitizeUrl(this.source) : this.source;
  }


  render() {
    return <Host>
            <div>
              { this.loading ?
                <div class="seb-iframe-loading"><slot></slot></div> : ''
              }
              <iframe src={this.getSafeSrc()}
                      ref={(el) => this.iframe = el as HTMLIFrameElement}
                      class="seb-iframe"
                      frameborder="0"
                      scrolling="no"
                      onLoad={ev => this.onIframeLoad(ev)}>
              </iframe>
            </div>
      </Host>;
  }

  private addElementResizeDetector(body: HTMLElement, style: any) {
    erd.listenTo(body, () => {
      // clear timeout
      clearTimeout(this._resizeDebounceTimeout);

      // set timeout (resize complete event)
      this._resizeDebounceTimeout = setTimeout(() => this.updateSize(style), this.resizeDebounce);
    });
  }

  private updateSize(style?: any) {
    const computedStyle =  style || this.iframe.contentWindow.getComputedStyle(this.iframe.contentDocument.body);
    const offsetHeight = this.iframe.contentDocument.body.offsetHeight;
    const marginTop = parseInt(computedStyle.getPropertyValue('margin-top'), 10);
    const marginBottom = parseInt(computedStyle.getPropertyValue('margin-bottom'), 10);
    const height = (offsetHeight + marginTop + marginBottom) * this._scale;
    const width = this.iframe.contentDocument.body.offsetWidth;
    this.iframe.style.height = `${height}px`;
    if((this.matchContentWidth !== false && this._hasBodyWidthRule && width && !this.scaleContent) || this.minWidth) {
      this.iframe.style.minWidth = this.minWidth || `${width}px`;
    } else {
      this.iframe.style.minWidth = '100%';
    }
    this.magicIframeEventHandler({ event: 'iframe-resized', details: {width, height} });

  }

  private addUnloadListener() {
    this.iframe.contentWindow.addEventListener('unload',($event: Event) => {
      this.loaded = false;
      this.iframe.contentDocument.body.style.overflow = 'hidden';
      this.magicIframeEventHandler({ event: 'iframe-unloaded', details: $event });
    });
  }
  private addClickListener() {
    this.iframe.contentDocument.addEventListener('click',($event: MouseEvent) => {
      this.magicIframeEventHandler({ event: 'iframe-click', details: $event });
    });
  }
  private addKeyUpListener() {
    this.iframe.contentDocument.addEventListener('keyup',($event: KeyboardEvent) => {
      this.magicIframeEventHandler({ event: 'iframe-keyup', details: $event });
    });
  }

  private addCss() {
    // if styles are defined...
    if(this.styles && this.styles.length > 0) {
      // check if style element has been created...
      if (!this._styleElement) {
        // ...if not create it
        this._styleElement = this.iframe.contentDocument.createElement('style');
        // ..and give it a unique id so that we can remove it later on
        this._styleElement.setAttribute('id', 'sebMagicIframeStyles');
        // ...add styles to the created node
        this._styleElement.appendChild(this.iframe.contentDocument.createTextNode(this.styles));
      } else {
        // ...if style element exists, replace the content with new styles
        this._styleElement.innerText = this.styles;
      }
      // add element to DOM
      this.iframe.contentDocument.getElementsByTagName('head')[0].appendChild(this._styleElement);
      this.magicIframeEventHandler({ event: 'iframe-styles-added', details: this.styles });
    } else
      // if no styles are passed and style element exists...
      if(this._styleElement) {
      // ...get style element inside iframe
      let styleElement = this.iframe.contentDocument.getElementById('sebMagicIframeStyles');
      // ...remove style element from DOM
      styleElement.parentNode.removeChild(styleElement);
      // ...clear styleElement
      this._styleElement = null;
      styleElement = null;
      this.magicIframeEventHandler({ event: 'iframe-styles-removed', details: this.styles });

    }
  }
  private preventOverflow(): boolean {
    try {
      const styleElement = this.iframe.contentDocument.createElement('style');
      this.styleElement = styleElement;
      styleElement.appendChild(this.iframe.contentDocument.createTextNode('html { overflow: hidden; }'));
      this.iframe.contentDocument.getElementsByTagName('head')[0].appendChild(styleElement);
      return false;
    } catch (error) {
      console.log('Event listeners and/or styles and resize listener could not be added due to a cross-origin frame error.');
      console.warn(error);
      this.magicIframeEventHandler({ event: 'iframe-loaded-with-errors', details: error});
      this.loading = false;
      return true;
    }
  }

  private addStyleSheets() {

    // remove stylesheets if present
    if(this._stylesheets && this._stylesheets.length > 0) {
      const stylesheets = this.iframe.contentDocument.head.querySelectorAll('link[data-seb-magic-iframe="true"]');
      for (var i = 0; i < stylesheets.length; i++) {
        stylesheets[i].parentNode.removeChild(stylesheets[i]);
      }
      this.magicIframeEventHandler({ event: 'iframe-all-stylesheets-removed', details: this.styleUrls });
    }

    if (this.styleUrls && this.styleUrls.length > 0) {

      // create placeholder for subjects
      const loadSubjects: Array<Subject<string>> = [];

      // loop through all style sheets...
      this.styleUrls.map((styleUrl: string) => {

        // create link element
        const linkElement: HTMLLinkElement  = this.iframe.contentDocument.createElement('link');
        this._stylesheets = [...this._stylesheets, linkElement];
        //linkElement['data-seb-magic-iframe'] = 'true';
        linkElement.setAttribute('data-seb-magic-iframe', 'true');
        linkElement['rel'] = 'stylesheet';
        linkElement['type'] = 'text/css';
        linkElement['href'] = this.sanitizeSource ? sanitizeUrl(styleUrl) : styleUrl;

        // create load subject that will emit once the stylesheet has loaded
        const loadSubject: Subject<string> = new Subject<string>();
        loadSubjects.push(loadSubject);

        // listen to load event on link
        linkElement.addEventListener('load', () => {
          this.iframe.contentDocument.body.style.overflow = 'inherit';
          this.magicIframeEventHandler({ event: 'iframe-stylesheet-loaded', details: styleUrl});
          loadSubject.next(styleUrl);
          loadSubject.complete();
          return true;
        });

        // push listener to array so that we can remove them later
        // this.eventListeners.push(stylesheetLoadListener);

        // add link to iframe head
        this.iframe.contentDocument.head.insertBefore(linkElement, this.styleElement);

        // emit load event
        this.magicIframeEventHandler({ event: 'iframe-stylesheet-load', details: styleUrl});
      });

      forkJoin(loadSubjects)
        .pipe(
          //takeUntil(this.$unsubscribe)
        )
        .subscribe(() => {
          if (this.styleUrls.length > 1) {
            this.magicIframeEventHandler({ event: 'iframe-all-stylesheets-loaded', details: this.styleUrls});
          }
          // check if body has width rule defined
          this.hasBodyWidthRule();
          this.loading = false;
          //this.$loading.next(false);
        });
    } else {
      // check if body has width rule defined
      this.hasBodyWidthRule();
      this.loading = false;
    }
  }

  private setScale(scale?: number) {
    // scale isn't passed...
    if (!scale) {
      // ...set scale value to...
      // 1. if previous zoom value and iframe has width rule set on body element: previous value
      // 2. if no previous value: the relation between iframe width and the width of the iframe content
      const calculatedScale = this._previousScale && this._hasBodyWidthRule ?
        this._previousScale : (this.iframe.clientWidth / this.iframe.contentDocument.body.offsetWidth);
      // reset previous scale value
      this._previousScale = null;
      // restrict scale to max 1
      this._scale = calculatedScale > 1 ? 1 : calculatedScale;
    } else {
      // ...if scale value is passed, use it
      this._previousScale = scale;
      this._scale = scale;
    }
    // set style attribute for iframe body
    this.iframe.contentDocument.body.style.transformOrigin = 'top left';
    this.iframe.contentDocument.body.style.transform = 'scale3d(' + this._scale + ',' + this._scale + ',1)';
    this.updateSize();

    // emit content scale event if it has changed or been reset
    if(scale || this._scale !== 1) {
      this.magicIframeEventHandler({ event: 'iframe-content-scaled', details: this._scale});
    }
  }

  private filterCssRuleBodyWidth(cssRule: CSSRule) {
    return (cssRule && cssRule.type === 1 // filter style rules of type 1 i.e. CSSStyleRule
      && cssRule['selectorText'] === 'body') // filter rules that apply to body
      && (cssRule['style'].width || cssRule['style'].minWidth); // that contains width or minWidth
  }

  private removeElementResizeDetector() {
    if (this.iframe.contentDocument.body && erd) {
      erd.uninstall(this.iframe.contentDocument.body);
    }
  }

  private scale() {
    // if resize content...
    if (this.scaleContent) {
      // ...scale iframe
      this.setScale();

      // ...check if resize listener is defined...
      if (!this._resizeListener) {
        // ...if not add it
        this._resizeListener = () => {
          // clear timeout
          clearTimeout(this._scaleDebounceTimeout);

          // set timeout (resize complete event)
          this._scaleDebounceTimeout = setTimeout(() => this.setScale(), this.scaleDebounce);
        };
        addEventListener('resize', this._resizeListener);
      }
    } else if (!this.scaleContent && this._resizeListener)  {
      // remove event listener
      removeEventListener('resize', this._resizeListener);
      this._resizeListener = null;

      // reset scale
      this.setScale(1);
    }
  }

  private hasBodyWidthRule() {
    if (this.matchContentWidth !== 'auto') {
      this._hasBodyWidthRule = this.matchContentWidth;
      this.updateSize();
      return;
    }
    try {
      // return all rules applied to body containing 'width'
      let widthRule = [].slice.call(this.iframe.contentDocument.styleSheets)
        .reduce((prev, styleSheet) => {
          return styleSheet.cssRules ? [...prev, [].slice.call(styleSheet.cssRules)
              .map(rule => rule.type === 4 ? ([].slice.call(rule.cssRules)
              // get last media query rule for selector or return basic css style rule
                .filter(this.filterCssRuleBodyWidth).pop()) : rule)
              .filter(this.filterCssRuleBodyWidth)
              .reduce((prevCss, cssRule: CSSRule) => [...prevCss, cssRule['style'].width || cssRule['style'].minWidth], [])]
            : [...prev];
        }, []);
      widthRule = [].concat.apply([], widthRule);
      this._hasBodyWidthRule = widthRule.length > 0;
      this.updateSize();
    } catch (error) {
      console.log('Can\'t read css rules from stylesheet loaded from external domain.');
      console.warn(error);
    }
  }

}