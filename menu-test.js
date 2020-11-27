import Menu from './menu.js';

const menu = new Menu([
    {label: "Menu Item 1"},
    {label: "Menu Item 2"},
    {label: "Menu Item 3"},
    {label: "Menu Item 4"},
    {label: "Menu Item 5", submenu: [
        {label: "Menu Item 1"},
        {label: "Menu Item 2"},
        {label: "Menu Item 3"},
        {label: "Menu Item 4"},
        {label: "Menu Item 5"},
    ]},
    {label: "Menu Item 6", icon: "https://hasura.io/blog/content/images/downloaded_images/setting-up-git-bash-for-windows-e26b59e44257/1-Je4yF-xdHEluVvmS0qw8JQ.png"},
    {label: "Menu Item 7"},
])

// menu.open({clientX: 0, clientY: 0});
window.addEventListener('contextmenu', e=>{
    e.preventDefault();
    menu.open(e)
})