/**
 * Protección contra traductores del navegador (Google Translate de Chrome, sobre todo en Android).
 *
 * El traductor reemplaza los textos de la página por elementos <font> propios. Cuando React luego
 * quiere actualizar o insertar contenido junto a un texto que ya no está, el navegador lanza
 * "NotFoundError: Failed to execute 'insertBefore' on 'Node'" y la pantalla se rompe
 * (p. ej. al cargar un comprobante, cuando aparece "Analizando con IA...").
 *
 * La página se declara en español y "notranslate" (index.html) para que Chrome no la traduzca;
 * esto cubre el caso en que el usuario la traduce igual: en vez de fallar, se tolera el nodo faltante.
 */
export function installTranslationGuard(): void {
  if (typeof Node !== 'function' || !Node.prototype) return;
  const proto = Node.prototype as Node & { __isfTranslationGuard?: boolean };
  if (proto.__isfTranslationGuard) return;
  proto.__isfTranslationGuard = true;

  const originalRemoveChild = Node.prototype.removeChild;
  Node.prototype.removeChild = function <T extends Node>(this: Node, child: T): T {
    if (child.parentNode !== this) {
      // El traductor ya lo sacó o lo movió: si sigue en la página, se quita de donde esté
      child.parentNode?.removeChild(child);
      return child;
    }
    return originalRemoveChild.call(this, child) as T;
  };

  const originalInsertBefore = Node.prototype.insertBefore;
  Node.prototype.insertBefore = function <T extends Node>(this: Node, newNode: T, referenceNode: Node | null): T {
    if (referenceNode && referenceNode.parentNode !== this) {
      // La referencia fue reemplazada por el traductor: se agrega al final en lugar de fallar
      return originalInsertBefore.call(this, newNode, null) as T;
    }
    return originalInsertBefore.call(this, newNode, referenceNode) as T;
  };
}
