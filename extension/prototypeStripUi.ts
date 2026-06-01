import {
	ENVIRONMENT_PROTOTYPES,
	type EnvironmentPrototypeOption,
	PrototypeStripMenuId,
	RENDERING_DETAIL_PROTOTYPES,
	SECTION_PROTOTYPES,
	type SectionPrototypeOption,
} from './prototypeStripSpec';
import type { RenderingDetailLevel } from './viewerRenderingDetails';
import { renderingDetailIconMarkup } from './viewerRenderingDetails';
import type { ViewerEnvironmentId } from './viewerEnvironments';

export const PROTOTYPE_STRIP_ROOT_ID = 'prototype-strip-root';

const STRIP_CLASS = 'priyam-prototype-strip';
const MENU_CLASS = 'priyam-prototype-menu';

export interface PrototypeStripState {
	environmentId: ViewerEnvironmentId;
	sectionPrototypeId: SectionPrototypeOption['id'] | null;
	renderingDetailLevel: RenderingDetailLevel;
	sectionActive: boolean;
}

export interface PrototypeStripHandlers {
	onEnvironmentSelect: (id: ViewerEnvironmentId) => void;
	onSectionSelect: (id: SectionPrototypeOption['id']) => void;
	onSectionClear: () => void;
	onRenderingDetailSelect: (level: RenderingDetailLevel) => void;
}

const isViewerEnvironmentId = (value: string): value is ViewerEnvironmentId =>
	value === 'cad-bim-neutral' || value === 'acc-default' || value === 'sheet-2d-3d-alignment';

const menuItemMarkup = (
	options: { id: string; label: string; description: string; disabled?: boolean }[],
	selectedId: string | null,
	dataAttr: string
): string =>
	options
		.map(
			option => `
		<button
			type="button"
			role="menuitemradio"
			class="${MENU_CLASS}__item${option.disabled ? ` ${MENU_CLASS}__item--disabled` : ''}"
			data-${dataAttr}="${option.id}"
			aria-checked="${option.id === selectedId}"
			${option.disabled ? 'disabled' : ''}
		>
			<span class="${MENU_CLASS}__radio" aria-hidden="true"></span>
			<span class="${MENU_CLASS}__text">
				<span class="${MENU_CLASS}__title">${option.label}</span>
				<span class="${MENU_CLASS}__description">${option.description}</span>
			</span>
		</button>
	`
		)
		.join('');

const renderingDetailMenuItemMarkup = (
	options: { id: string; label: string; description: string }[],
	selectedId: string | null
): string =>
	options
		.map(option => {
			const level = option.id as RenderingDetailLevel;
			return `
		<button
			type="button"
			role="menuitemradio"
			class="${MENU_CLASS}__item ${MENU_CLASS}__item--fidelity"
			data-rendering-detail="${option.id}"
			aria-checked="${option.id === selectedId}"
		>
			<span class="${MENU_CLASS}__fidelity-icon" aria-hidden="true">${renderingDetailIconMarkup(level)}</span>
			<span class="${MENU_CLASS}__text">
				<span class="${MENU_CLASS}__title">${option.label}</span>
				<span class="${MENU_CLASS}__description">${option.description}</span>
			</span>
		</button>
	`;
		})
		.join('');

export class PrototypeStripUi {
	private readonly strip: HTMLDivElement;
	private readonly menuLayer: HTMLDivElement;
	private readonly buttons = new Map<PrototypeStripMenuId, HTMLButtonElement>();
	private openMenuId: PrototypeStripMenuId | null = null;
	private menuElement: HTMLDivElement | undefined;
	private documentClickHandler: ((event: MouseEvent) => void) | undefined;
	private state: PrototypeStripState;
	private readonly handlers: PrototypeStripHandlers;

	constructor(
		host: HTMLElement,
		initialState: PrototypeStripState,
		handlers: PrototypeStripHandlers
	) {
		this.state = initialState;
		this.handlers = handlers;

		this.strip = document.createElement('div');
		this.strip.className = STRIP_CLASS;
		this.strip.setAttribute('role', 'toolbar');
		this.strip.setAttribute('aria-label', 'Prototype controls');

		this.menuLayer = document.createElement('div');
		this.menuLayer.className = `${STRIP_CLASS}__menus`;
		this.strip.appendChild(this.menuLayer);

		this.addDropdownButton('environment', 'Environment');
		this.addDropdownButton('section', 'Section');

		host.replaceChildren(this.strip);
	}

	public updateState(partial: Partial<PrototypeStripState>): void {
		this.state = { ...this.state, ...partial };
		if (this.openMenuId) {
			this.renderMenu(this.openMenuId);
		}
	}

	public destroy(): void {
		this.closeMenu();
		this.strip.remove();
	}

	private addDropdownButton(id: PrototypeStripMenuId, label: string): void {
		const button = document.createElement('button');
		button.type = 'button';
		button.className = `${STRIP_CLASS}__trigger`;
		button.setAttribute('aria-haspopup', 'menu');
		button.setAttribute('aria-expanded', 'false');
		button.dataset.menu = id;
		button.innerHTML = `
			<span class="${STRIP_CLASS}__trigger-label">${label}</span>
			<span class="${STRIP_CLASS}__chevron" aria-hidden="true"></span>
		`;
		button.addEventListener('click', event => {
			event.stopPropagation();
			this.toggleMenu(id);
		});
		this.buttons.set(id, button);
		this.strip.insertBefore(button, this.menuLayer);
	}

	private toggleMenu(id: PrototypeStripMenuId): void {
		if (this.openMenuId === id) {
			this.closeMenu();
			return;
		}
		this.closeMenu();
		this.openMenuId = id;
		this.renderMenu(id);
		this.bindDocumentClick();
		const button = this.buttons.get(id);
		button?.setAttribute('aria-expanded', 'true');
		button?.classList.add(`${STRIP_CLASS}__trigger--open`);
	}

	private renderMenu(id: PrototypeStripMenuId): void {
		this.menuElement?.remove();
		const button = this.buttons.get(id);
		if (!button) return;

		const menu = document.createElement('div');
		menu.className = MENU_CLASS;
		menu.setAttribute('role', 'menu');

		if (id === 'environment') {
			menu.innerHTML = `
				<div class="${MENU_CLASS}__section">
					<div class="${MENU_CLASS}__header">Environment</div>
					${menuItemMarkup(ENVIRONMENT_PROTOTYPES, this.state.environmentId, 'environment')}
				</div>
				<div class="${MENU_CLASS}__section">
					<div class="${MENU_CLASS}__header">Rendering details</div>
					${renderingDetailMenuItemMarkup(RENDERING_DETAIL_PROTOTYPES, this.state.renderingDetailLevel)}
				</div>
			`;
			menu.addEventListener('click', this.onEnvironmentMenuClick);
		} else {
			menu.innerHTML = `
				<div class="${MENU_CLASS}__section">
					<div class="${MENU_CLASS}__header">Section Box</div>
					${menuItemMarkup(
						SECTION_PROTOTYPES,
						this.state.sectionActive ? (this.state.sectionPrototypeId ?? 'green-box') : null,
						'section'
					)}
				</div>
				<div class="${MENU_CLASS}__footer">
					<button
						type="button"
						class="${MENU_CLASS}__clear"
						data-section-clear="true"
						${this.state.sectionActive ? '' : 'disabled'}
					>
						Clear all
					</button>
				</div>
			`;
			menu.addEventListener('click', this.onSectionMenuClick);
		}

		this.menuLayer.appendChild(menu);
		this.menuElement = menu;
		this.positionMenu(button, menu);
	}

	private positionMenu(button: HTMLButtonElement, menu: HTMLDivElement): void {
		const stripRect = this.strip.getBoundingClientRect();
		const buttonRect = button.getBoundingClientRect();
		const menuRect = menu.getBoundingClientRect();
		const left = buttonRect.left - stripRect.left;
		const top = buttonRect.top - stripRect.top - menuRect.height - 8;
		menu.style.left = `${left}px`;
		menu.style.top = `${top}px`;
	}

	private onEnvironmentMenuClick = (event: MouseEvent): void => {
		const target = (event.target as HTMLElement).closest<HTMLElement>(
			'[data-environment], [data-rendering-detail]'
		);
		if (!target) return;

		const environmentId = target.dataset.environment;
		if (environmentId && isViewerEnvironmentId(environmentId)) {
			this.handlers.onEnvironmentSelect(environmentId);
			this.state.environmentId = environmentId;
			this.closeMenu();
			return;
		}

		const renderingDetail = target.dataset.renderingDetail as RenderingDetailLevel | undefined;
		if (renderingDetail === 'low' || renderingDetail === 'high') {
			this.handlers.onRenderingDetailSelect(renderingDetail);
			this.state.renderingDetailLevel = renderingDetail;
			this.renderMenu('environment');
		}
	};

	private onSectionMenuClick = (event: MouseEvent): void => {
		const clearTarget = (event.target as HTMLElement).closest<HTMLElement>('[data-section-clear]');
		if (clearTarget) {
			if (clearTarget.hasAttribute('disabled')) return;
			this.handlers.onSectionClear();
			this.state.sectionActive = false;
			this.state.sectionPrototypeId = null;
			this.closeMenu();
			return;
		}

		const target = (event.target as HTMLElement).closest<HTMLElement>('[data-section]');
		if (!target || target.hasAttribute('disabled')) return;

		const sectionId = target.dataset.section as SectionPrototypeOption['id'] | undefined;
		if (!sectionId) return;

		this.handlers.onSectionSelect(sectionId);
		this.state.sectionPrototypeId = sectionId;
		this.closeMenu();
	};

	private bindDocumentClick(): void {
		this.documentClickHandler = (event: MouseEvent): void => {
			const target = event.target as Node;
			if (this.strip.contains(target)) return;
			this.closeMenu();
		};
		setTimeout(() => {
			if (this.documentClickHandler) {
				document.addEventListener('mousedown', this.documentClickHandler);
			}
		}, 0);
	}

	private closeMenu(): void {
		if (this.menuElement) {
			this.menuElement.removeEventListener('click', this.onEnvironmentMenuClick);
			this.menuElement.removeEventListener('click', this.onSectionMenuClick);
			this.menuElement.remove();
			this.menuElement = undefined;
		}
		if (this.documentClickHandler) {
			document.removeEventListener('mousedown', this.documentClickHandler);
			this.documentClickHandler = undefined;
		}
		if (this.openMenuId) {
			const button = this.buttons.get(this.openMenuId);
			button?.setAttribute('aria-expanded', 'false');
			button?.classList.remove(`${STRIP_CLASS}__trigger--open`);
		}
		this.openMenuId = null;
	}
}
