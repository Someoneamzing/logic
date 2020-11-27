export default class Menu {
    constructor(menuDef) {
        this.element = Menu.createMenuTree(this, menuDef);
        this.blurHandler = this.blurHandler.bind(this);
        this.size = {width: 0, height: 0}
        this.open({clientX: 0, clientY: 0});
        this.size = this.element.getBoundingClientRect();
        this.close();
    }

    open(e) {
        this.element.classList.toggle('flipped', e.clientX > window.innerWidth - this.size.width);
        this.element.style.left = e.clientX + 'px';
        this.element.style.top = e.clientY + 'px';
        document.body.append(this.element);
        window.addEventListener('click', this.blurHandler);
    }

    close() {
        document.body.removeChild(this.element);
        window.removeEventListener('click', this.blurHandler);
    }

    blurHandler(e) {
        if (!this.element.contains(e.target)) {
            this.close();
        }
    }

    static createMenuTree(menuObj, menuDef) {
        const menu = document.createElement('ul');
        menu.classList.add('menu');
        for (let itemDef of menuDef) {
            const item = document.createElement('li');
            item.classList.add('menu-item');
            item.insertAdjacentHTML('beforeend', `${itemDef.icon?`<img src="${itemDef.icon}" class="menu-item-icon">`:''}<span class="menu-item-label">${itemDef.label}</span>${itemDef.submenu?'<span class="menu-item-submenu-arrow">⯈</span>':''}`);
            if (itemDef.submenu) {
                const submenu = Menu.createMenuTree(menuObj, itemDef.submenu);
                submenu.classList.add('submenu')
                item.append(submenu);
            }
            item.addEventListener('click', (e)=>{
                e.stopImmediatePropagation()
                if (itemDef.click) itemDef.click.call(item, e);
                menuObj.close();
            })
            menu.append(item)
        }


        return menu;
    }
}