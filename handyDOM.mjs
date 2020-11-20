export default function handyDOM(ids){
  let namespace = Object.create(null);
  if (!ids) {
    let elems = document.querySelectorAll("*[id]");
    for (let elem of elems) {
      namespace[camelCasify(elem.id)] = elem;
    }
  } else {
    for (let id of ids) {
      namespace[camelCasify(id)] = document.getElementById(id);
    }
  }
  return namespace;

}

function camelCasify(name) {
  return name.replace(/[\-_]+([a-zA-Z0-9])/g, (...groups)=>groups[1].toUpperCase())
}
