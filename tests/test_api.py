#!/usr/bin/env python3
"""
Pruebas de la API de GaMa (solo biblioteca estándar de Python).

Uso:   python3 tests/test_api.py [URL_BASE]
       (por defecto http://127.0.0.1:8080)

Requisitos: servidor PHP sirviendo el proyecto, base `gama` recién importada
desde sql/gama.sql y el cliente `mysql` disponible (se usa solo para leer
el hash guardado). Cada prueba verifica el CÓDIGO HTTP y el contenido.
"""
import http.cookiejar
import json
import os
import shutil
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request

BASE = (sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8080").rstrip("/")
API = BASE + "/api"
resultados = []


class Cliente:
    """Un navegador simulado: guarda cookies y el token CSRF."""

    def __init__(self, base=API):
        self.base = base
        self.jar = http.cookiejar.CookieJar()
        self.op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(self.jar))
        self.csrf = ""

    def pedir(self, metodo, ruta, cuerpo=None, csrf=True, tipo="application/json", crudo=None):
        datos = crudo if crudo is not None else (json.dumps(cuerpo).encode() if cuerpo is not None else None)
        req = urllib.request.Request(self.base + ruta, data=datos, method=metodo)
        if datos is not None:
            req.add_header("Content-Type", tipo)
        if csrf and self.csrf:
            req.add_header("X-CSRF-Token", self.csrf)
        try:
            with self.op.open(req) as r:
                codigo, texto = r.status, r.read().decode()
        except urllib.error.HTTPError as e:
            codigo, texto = e.code, e.read().decode()
        try:
            return codigo, json.loads(texto)
        except ValueError:
            return codigo, {"_crudo": texto}

    def login(self, email, clave):
        c, j = self.pedir("POST", "/login.php", {"email": email, "password": clave}, csrf=False)
        if c == 200:
            self.csrf = j["csrf"]
        return c, j

    def cookie_sesion(self):
        return next((c.value for c in self.jar if c.name == "GAMA_SESION"), None)


def chequear(nombre, condicion, detalle=""):
    resultados.append({"prueba": nombre, "ok": bool(condicion), "detalle": str(detalle)[:200]})
    print(("  OK   " if condicion else "  FALLA") + " " + nombre + ("" if condicion else f"  → {detalle}"))


HAY_MYSQL = shutil.which("mysql") is not None
HAY_PHP = shutil.which("php") is not None


def sql(consulta):
    """Consulta directa a la base (solo si el cliente `mysql` está en el PATH)."""
    if not HAY_MYSQL:
        return None
    r = subprocess.run(["mysql", "-uroot", "-h127.0.0.1", "gama", "-N", "-e", consulta],
                       capture_output=True, text=True)
    return r.stdout.strip()


def omitida(nombre):
    print(f"  OMITIDA {nombre} (falta `mysql` o `php` en el PATH)")


def seccion(t):
    print(f"\n[{t}]")


# ---------------------------------------------------------------------
seccion("Catálogo público (GET unidades)")
anon = Cliente()
c, j = anon.pedir("GET", "/unidades.php")
chequear("GET unidades → 200 y 6 unidades", c == 200 and len(j["data"]) == 6, c)
chequear("incluye lista de categorías", len(j.get("categorias", [])) == 3)
chequear("precio llega como número", isinstance(j["data"][0]["precio"], (int, float)))
c, j = anon.pedir("GET", "/unidades.php?categoria=Volcador")
chequear("filtro por categoría", c == 200 and len(j["data"]) == 2 and all(u["categoria"] == "Volcador" for u in j["data"]))
c, j = anon.pedir("GET", "/unidades.php?q=hormig")
chequear("búsqueda de texto", c == 200 and [u["id"] for u in j["data"]] == ["mixer"], j)
c, j = anon.pedir("GET", "/unidades.php?q=%25")
chequear("el % del usuario no actúa como comodín", c == 200 and j["data"] == [], j)
c, j = anon.pedir("GET", "/unidades.php?id=mixer")
chequear("ficha de una unidad", c == 200 and j["data"]["id"] == "mixer")
c, j = anon.pedir("GET", "/unidades.php?id=no-existe")
chequear("unidad inexistente → 404", c == 404)
c, j = anon.pedir("GET", "/unidades.php?id=" + urllib.parse.quote("' OR '1'='1"))
chequear("inyección SQL en id → 404, no 500", c == 404, c)
c, j = anon.pedir("GET", "/unidades.php?todas=1")
chequear("?todas=1 anónimo → 401", c == 401)
c, j = anon.pedir("PATCH", "/unidades.php")
chequear("método no permitido → 405", c == 405)

# ---------------------------------------------------------------------
seccion("Acceso anónimo a recursos protegidos → 401")
for ruta in ("/pedidos.php", "/perfil.php", "/reportes.php"):
    c, _ = anon.pedir("GET", ruta)
    chequear(f"GET {ruta} sin sesión → 401", c == 401, c)
c, _ = anon.pedir("POST", "/pedidos.php", {})
chequear("POST /pedidos.php sin sesión → 401", c == 401)
c, _ = anon.pedir("POST", "/unidades.php", {})
chequear("POST /unidades.php sin sesión → 401", c == 401)

# ---------------------------------------------------------------------
seccion("Consulta de sesión (SPA)")
c, j = anon.pedir("GET", "/sesion.php")
chequear("visitante: GET sesion.php → 200 con autenticado=false (sin error en consola)", c == 200 and j["autenticado"] is False, j)

# ---------------------------------------------------------------------
seccion("Login y sesión")
c, j = anon.pedir("POST", "/login.php", {"email": "", "password": ""}, csrf=False)
chequear("login sin datos → 400", c == 400)
c, j1 = anon.pedir("POST", "/login.php", {"email": "obras.lopez@gama.com", "password": "mala"}, csrf=False)
c2, j2 = anon.pedir("POST", "/login.php", {"email": "nadie@gama.com", "password": "mala"}, csrf=False)
chequear("contraseña mala → 401", c == 401)
chequear("e-mail inexistente → 401 con el MISMO mensaje (no delata cuentas)", c2 == 401 and j1["mensaje"] == j2["mensaje"])
c, j = anon.pedir("POST", "/login.php", {"email": "' OR '1'='1' -- ", "password": "x"}, csrf=False)
chequear("inyección SQL en el login → 401, no 500", c == 401, c)
c, j = anon.pedir("POST", "/login.php", crudo=b"email=a&password=b", tipo="application/x-www-form-urlencoded", csrf=False)
chequear("login con formulario (no JSON) → 415", c == 415, c)
c, j = anon.pedir("GET", "/login.php")
chequear("GET /login.php → 405", c == 405)

cli = Cliente()
antes = cli.pedir("GET", "/unidades.php")  # sin cookie de sesión
chequear("visitante anónimo no recibe cookie de sesión", cli.cookie_sesion() is None)
c, j = cli.login("obras.lopez@gama.com", "volcador2026")
chequear("login correcto → 200 con rol cliente", c == 200 and j["usuario"]["rol"] == "cliente", j)
chequear("la respuesta nunca incluye el hash", "password" not in json.dumps(j))
chequear("devuelve token CSRF de 64 caracteres", len(j.get("csrf", "")) == 64)
c, j = cli.pedir("GET", "/sesion.php")
chequear("logueado: sesion.php → autenticado=true con rol y CSRF", c == 200 and j["autenticado"] and j["data"]["rol"] == "cliente" and len(j["csrf"]) == 64, j)
c, j = cli.pedir("GET", "/perfil.php")
chequear("perfil con sesión → 200", c == 200 and j["data"]["email"] == "obras.lopez@gama.com")

fijacion = Cliente()
fijacion.login("despacho@gama.com", "hormigon2026")
id1 = fijacion.cookie_sesion()
fijacion.login("despacho@gama.com", "hormigon2026")
chequear("session_regenerate_id: el ID de sesión cambia al autenticarse", id1 and id1 != fijacion.cookie_sesion())

# ---------------------------------------------------------------------
seccion("Hash BCRYPT")
if HAY_MYSQL:
    h = sql("SELECT password FROM usuarios WHERE email='obras.lopez@gama.com'")
    chequear("contraseña guardada con BCRYPT costo 12 (60 caracteres)", h.startswith("$2y$12$") and len(h) == 60, h[:12])
    chequear("columna password es VARCHAR(255)", "varchar(255)" in sql("SELECT COLUMN_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA='gama' AND TABLE_NAME='usuarios' AND COLUMN_NAME='password'").lower())
else:
    omitida("verificación del hash BCRYPT en la base")

# ---------------------------------------------------------------------
seccion("Registro")
nuevo = Cliente()
c, j = nuevo.pedir("POST", "/registro.php", {"nombre": "Ab", "email": "malo", "telefono": "x", "password": "123"}, csrf=False)
chequear("registro con datos inválidos → 400", c == 400)
c, j = nuevo.pedir("POST", "/registro.php", {"nombre": "Marta Test", "email": "marta@test.com", "telefono": "376 5551234",
                                              "password": "clavesegura1", "rol": "gerente"}, csrf=False)
chequear("registro correcto → 201", c == 201, j)
if HAY_MYSQL:
    chequear("aunque mande rol=gerente, queda como cliente", sql("SELECT rol FROM usuarios WHERE email='marta@test.com'") == "cliente")
else:
    omitida("rol forzado a cliente (consulta a la base)")
c, j = Cliente().pedir("POST", "/registro.php", {"nombre": "Marta Test", "email": "MARTA@test.com", "telefono": "376 5551234",
                                                  "password": "clavesegura1"}, csrf=False)
chequear("e-mail repetido → 409", c == 409, j)

# ---------------------------------------------------------------------
seccion("Presupuesto (cálculo en el servidor)")
c, j = anon.pedir("POST", "/presupuesto.php", {"items": [{"id": "mixer", "cantidad": 5}], "cupon": "ucp10"}, csrf=False)
chequear("5 mixer + UCP10 → 20 % y total 380.000", c == 200 and j["data"]["total"] == 380000 and j["data"]["descuento_pct"] == 20, j)
c, j = anon.pedir("POST", "/presupuesto.php", {"items": [{"id": "mixer", "cantidad": 1}]}, csrf=False)
chequear("1 mixer sin descuento → 95.000", c == 200 and j["data"]["total"] == 95000)
c, j = anon.pedir("POST", "/presupuesto.php", {"items": [{"id": "mixer", "cantidad": 1}], "cupon": "FALSO"}, csrf=False)
chequear("cupón inexistente → 400", c == 400)
c, j = anon.pedir("POST", "/presupuesto.php", {"items": [{"id": "inexistente", "cantidad": 1}]}, csrf=False)
chequear("unidad inexistente → 400", c == 400)
c, j = anon.pedir("POST", "/presupuesto.php", {"items": [{"id": "mixer", "cantidad": 0}]}, csrf=False)
chequear("cantidad 0 → 400", c == 400)
c, j = anon.pedir("POST", "/presupuesto.php", {"items": [{"id": "mixer", "cantidad": 11}]}, csrf=False)
chequear("11 viajes → 15 % por volumen", c == 200 and j["data"]["descuento_pct"] == 15, j)

# ---------------------------------------------------------------------
seccion("Pedidos del cliente")
pedido = {"direccion": "Av. Mitre 1234, Posadas", "telefono": "376 4111222", "medio_pago": "Efectivo",
          "comentarios": "Descargar por la calle lateral", "items": [{"id": "volcador-chico", "cantidad": 2, "precio": 1}]}
c, j = cli.pedir("POST", "/pedidos.php", pedido, csrf=False)
chequear("POST pedidos sin token CSRF → 403", c == 403, c)
c, j = cli.pedir("POST", "/pedidos.php", pedido)
chequear("pedido correcto → 201", c == 201, j)
chequear("el precio que manda el navegador se ignora (2 × 45.000)", j["data"]["total"] == 90000, j)
pid = j["data"]["id"]
c, j = cli.pedir("POST", "/pedidos.php", {**pedido, "medio_pago": "Bitcoin"})
chequear("medio de pago inválido → 400", c == 400)
c, j = cli.pedir("POST", "/pedidos.php", {**pedido, "items": []})
chequear("pedido sin ítems → 400", c == 400)
c, j = cli.pedir("POST", "/pedidos.php", {**pedido, "direccion": "x'); DROP TABLE pedidos;--"})
chequear("texto con SQL se guarda como texto (201) y no rompe nada", c == 201 and sql("SELECT COUNT(*) FROM pedidos") != "", c) if HAY_MYSQL else chequear("texto con SQL se guarda como texto (201)", c == 201, c)
c, j = cli.pedir("GET", "/pedidos.php")
chequear("GET pedidos → 200 con sus pedidos e ítems", c == 200 and len(j["data"]) >= 2 and j["data"][0]["items"], c)
c, j = cli.pedir("GET", "/pedidos.php?todos=1")
chequear("cliente con ?todos=1 → 403", c == 403)
c, j = cli.pedir("GET", f"/pedidos.php?id={pid}")
chequear("GET de un pedido propio → 200", c == 200 and j["data"]["id"] == pid)
c, j = cli.pedir("GET", "/pedidos.php?id=abc")
chequear("id no numérico → 400", c == 400)

otro = Cliente()
otro.pedir("POST", "/registro.php", {"nombre": "Otro Cliente", "email": "otro@test.com", "telefono": "376 1112233",
                                      "password": "clavesegura2"}, csrf=False)
otro.login("otro@test.com", "clavesegura2")
c, j = otro.pedir("GET", f"/pedidos.php?id={pid}")
chequear("pedido ajeno → 404 (no revela que existe)", c == 404, c)
c, j = otro.pedir("DELETE", f"/pedidos.php?id={pid}")
chequear("cancelar pedido ajeno → 404", c == 404)

# ---------------------------------------------------------------------
seccion("Gestión del operario (RF3)")
op = Cliente()
op.login("despacho@gama.com", "hormigon2026")
c, j = op.pedir("GET", "/pedidos.php?todos=1")
chequear("operario ve todos los pedidos → 200", c == 200 and len(j["data"]) >= 2)
c, j = op.pedir("GET", "/pedidos.php?todos=1&estado=pendiente")
chequear("filtro por estado", c == 200 and all(p["estado"] == "pendiente" for p in j["data"]))
c, j = op.pedir("GET", "/pedidos.php?todos=1&estado=inventado")
chequear("estado inválido → 400", c == 400)
c, j = cli.pedir("PUT", f"/pedidos.php?id={pid}", {"estado": "confirmado"})
chequear("cliente no puede cambiar estados → 403", c == 403)
c, j = op.pedir("PUT", f"/pedidos.php?id={pid}", {"estado": "entregado"})
chequear("salto de estado pendiente→entregado → 409", c == 409, j)
for e in ("confirmado", "en viaje", "entregado"):
    c, j = op.pedir("PUT", f"/pedidos.php?id={pid}", {"estado": e})
    chequear(f"estado → {e} → 200", c == 200 and j["data"]["estado"] == e, j)
c, j = cli.pedir("DELETE", f"/pedidos.php?id={pid}")
chequear("cancelar un pedido ya entregado → 409", c == 409)
c, j = op.pedir("PUT", "/pedidos.php?id=999999", {"estado": "confirmado"})
chequear("pedido inexistente → 404", c == 404)

c, j = cli.pedir("POST", "/pedidos.php", pedido)
pid2 = j["data"]["id"]
c, j = cli.pedir("DELETE", f"/pedidos.php?id={pid2}")
chequear("el cliente cancela su pedido pendiente → 200", c == 200)
c, j = cli.pedir("DELETE", f"/pedidos.php?id={pid2}")
chequear("cancelar dos veces → 409", c == 409)

# ---------------------------------------------------------------------
seccion("Gestión de la flota (RF1) y roles")
nueva = {"id": "camioneta-test", "nombre": "Camioneta de prueba", "categoria": "Servicio especial", "capacidad": "2 m³",
         "carga_maxima": "1.500 kg", "uso": "Entregas urgentes", "precio": 12000, "tarifa": "por viaje"}
c, _ = cli.pedir("POST", "/unidades.php", nueva)
chequear("cliente intenta crear unidad → 403", c == 403)
c, _ = op.pedir("POST", "/unidades.php", nueva, csrf=False)
chequear("operario sin token CSRF → 403", c == 403)
c, j = op.pedir("POST", "/unidades.php", nueva)
chequear("operario crea unidad → 201", c == 201 and j["data"]["id"] == "camioneta-test", j)
c, j = op.pedir("POST", "/unidades.php", nueva)
chequear("id repetido → 409", c == 409)
c, j = op.pedir("POST", "/unidades.php", {**nueva, "id": "Mal Id!", "precio": -5})
chequear("datos inválidos → 400", c == 400)
c, j = op.pedir("PUT", "/unidades.php?id=camioneta-test", {**nueva, "precio": 13500})
chequear("operario edita precio → 200", c == 200 and j["data"]["precio"] == 13500, j)
c, j = op.pedir("PUT", "/unidades.php?id=no-existe", nueva)
chequear("editar inexistente → 404", c == 404)
c, j = op.pedir("DELETE", "/unidades.php?id=camioneta-test")
chequear("baja lógica → 200", c == 200)
c, j = anon.pedir("GET", "/unidades.php?id=camioneta-test")
chequear("unidad dada de baja ya no aparece en el catálogo público (404)", c == 404)
c, j = op.pedir("GET", "/unidades.php?todas=1")
chequear("el personal sí la ve con ?todas=1", c == 200 and any(u["id"] == "camioneta-test" and not u["activo"] for u in j["data"]))
c, j = cli.pedir("POST", "/presupuesto.php", {"items": [{"id": "camioneta-test", "cantidad": 1}]}, csrf=False)
chequear("no se puede pedir una unidad dada de baja → 400", c == 400)
c, j = op.pedir("PUT", "/unidades.php?id=camioneta-test", {**nueva, "activo": True})
chequear("reactivar con activo=true", c == 200 and j["data"]["activo"] is True)

# ---------------------------------------------------------------------
seccion("Reportes del gerente (RF4)")
c, _ = op.pedir("GET", "/reportes.php")
chequear("operario no ve reportes → 403", c == 403)
c, _ = cli.pedir("GET", "/reportes.php")
chequear("cliente no ve reportes → 403", c == 403)
ger = Cliente()
ger.login("gerencia@gama.com", "gerente2026")
c, j = ger.pedir("GET", "/reportes.php")
chequear("gerente ve reportes → 200", c == 200 and {"totales", "por_estado", "por_unidad", "por_cliente"} <= set(j["data"]), j)
chequear("los cancelados no suman ingresos", j["data"]["totales"]["ingresos"] > 0)

# ---------------------------------------------------------------------
seccion("Fuerza bruta y cierre de sesión")
fb = Cliente()
sql("DELETE FROM intentos_login WHERE email='bloqueo@gama.com'")
for i in range(5):
    fb.pedir("POST", "/login.php", {"email": "bloqueo@gama.com", "password": "mala"}, csrf=False)
c, j = fb.pedir("POST", "/login.php", {"email": "bloqueo@gama.com", "password": "mala"}, csrf=False)
chequear("6.º intento fallido seguido → 429", c == 429, c)
sql("DELETE FROM intentos_login WHERE email='bloqueo@gama.com'")

c, _ = cli.pedir("POST", "/logout.php", csrf=False)
chequear("logout sin token CSRF → 403", c == 403)
c, _ = cli.pedir("POST", "/logout.php")
chequear("logout → 200", c == 200)
c, _ = cli.pedir("GET", "/perfil.php")
chequear("después de salir, perfil → 401", c == 401)

# ---------------------------------------------------------------------
seccion("Errores internos sin filtrar datos")
if not HAY_PHP:
    omitida("500 genérico sin filtrar datos (necesita `php` en el PATH)")
else:
    import time
    puerto = "8099"
    srv = subprocess.Popen(["php", "-S", f"127.0.0.1:{puerto}", "-t", os.path.join(os.path.dirname(__file__), "..")],
                           env={**os.environ, "GAMA_DB_PASS": "clave-equivocada"},
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        time.sleep(1.2)
        roto = Cliente(f"http://127.0.0.1:{puerto}/api")
        c, j = roto.pedir("GET", "/unidades.php")
        cuerpo = json.dumps(j)
        chequear("base inaccesible → 500 genérico", c == 500 and j.get("mensaje") == "Error interno del servidor.", (c, cuerpo))
        chequear("el 500 no filtra SQLSTATE, usuario, host ni rutas", not any(x in cuerpo for x in ("SQLSTATE", "root", "127.0.0.1", ".php", "Access denied")), cuerpo)
    finally:
        srv.terminate()

# ---------------------------------------------------------------------
fallas = [r for r in resultados if not r["ok"]]
print(f"\n{len(resultados) - len(fallas)}/{len(resultados)} pruebas OK")
with open(os.path.join(os.path.dirname(__file__), "resultados_api.json"), "w", encoding="utf-8") as f:
    json.dump({"total": len(resultados), "fallas": len(fallas), "resultados": resultados}, f, ensure_ascii=False, indent=1)
sys.exit(1 if fallas else 0)
