# GaMa — Sistema de Gestión de Flota y Logística

**Proyecto:** GaMa · AE4 (TIFAS)
**Cátedra:** Paradigmas y Lenguajes de Programación III · Ingeniería en Sistemas de Información · UCP · 2026
**Docente:** Ing. Sicardi Dante

GaMa es el sistema de una empresa de camiones utilitarios que traslada material de construcción. Un cliente elige las unidades que necesita, ve cuánto le va a costar con los descuentos aplicados y pide el servicio. El personal de la empresa confirma y despacha los pedidos y mantiene la flota al día, y el gerente mira las estadísticas para decidir.

En la AE1 el sistema era un conjunto de páginas HTML estáticas con sus casos de uso. Para la AE4 lo evolucionamos a una **SPA** (aplicación de una sola página) en JavaScript Vanilla, que habla con un **backend PHP + MySQL** únicamente por HTTP e intercambio de JSON.

## Integrantes y roles

| Nombre | Rol | GitHub |
| :--- | :--- | :--- |
| **Octavio García** | Base de datos y backend (modelos, servicios, API REST) | [@octavioleogarcia-png](https://github.com/octavioleogarcia-png) |
| **Santiago Manrique** | Interfaz y lógica del cliente (SPA, accesibilidad) | [@Santiago-Manrique](https://github.com/Santiago-Manrique) |

## Qué puede hacer cada actor

Los actores son los de la AE1 (Cliente, Operario y Gerente). El informe de la AE1 define los requisitos funcionales RF1 a RF6 y los no funcionales RNF-7 a RNF-12 pero no detalla casos de uso uno por uno, así que los que siguen se derivan de esos requisitos. «Parcial» quiere decir que la AE4 cubre una parte del requisito. El módulo de Personal (RF2) queda fuera del alcance de esta entrega.

| Caso de uso | Actor | Requisito AE1 | Endpoint |
| :--- | :--- | :---: | :--- |
| CU-01 Consultar el catálogo (búsqueda y filtro) | Visitante / Cliente | RF5 | `GET /api/unidades.php` |
| CU-02 Ver la ficha de una unidad | Visitante / Cliente | RF5 | `GET /api/unidades.php?id=` |
| CU-03 Registrarse, ingresar y salir | Todos | RNF-7 (Seguridad) | `registro`, `login`, `logout`, `sesion`, `perfil` |
| CU-04 Calcular el presupuesto | Visitante / Cliente | RF6 | `POST /api/presupuesto.php` |
| CU-05 Solicitar transporte | Cliente | RF6 | `POST /api/pedidos.php` |
| CU-06 Ver y cancelar mis pedidos | Cliente | RF6 | `GET` y `DELETE /api/pedidos.php` |
| CU-07 Gestionar el estado de los pedidos | Operario | RF3 (parcial) | `GET ?todos=1` y `PUT /api/pedidos.php` |
| CU-08 Gestionar la flota | Operario | RF1 (parcial) | `POST`, `PUT`, `DELETE /api/unidades.php` |
| CU-09 Consultar reportes | Gerente | RF4 (parcial) | `GET /api/reportes.php` |

## Arquitectura: MVC desacoplado

El navegador y el servidor no comparten código ni sesiones de PHP en el HTML: solo se mandan peticiones HTTP y reciben JSON.

```
gama/
├── index.html              Redirige a public/
├── public/                 VISTA: la SPA (lo único que ve el navegador)
│   ├── index.html          HTML5 semántico con WCAG/ARIA
│   ├── css/estilos.css     Responsive y :focus-visible
│   └── js/app.js           Router, fetch + async/await, .textContent
├── api/                    CONTROLADORES: un archivo por recurso REST
│   ├── login.php  registro.php  logout.php  sesion.php  perfil.php
│   ├── unidades.php  presupuesto.php  pedidos.php  reportes.php
├── models/                 MODELOS: solo acceso a datos con PDO
│   ├── UsuarioModel.php  UnidadModel.php  PedidoModel.php
│   └── DescuentoModel.php  ReporteModel.php
├── services/               Reglas de negocio (cálculo de presupuesto) y validación
├── config/
│   ├── conexion.php        PDO con patrón Singleton
│   └── sesion.php          Cabeceras JSON, sesión, roles y CSRF
├── sql/gama.sql            Tablas y datos de prueba
├── tests/test_api.py       Pruebas de la API
└── docs/                   Informes y capturas
```

- **Vista (`public/`)**: no tiene PHP ni SQL. Todo lo dinámico lo hace `app.js` con `fetch()` y `async/await`, y los datos del servidor se insertan con `.textContent`, nunca con `innerHTML`.
- **Controlador (`api/`)**: lee el JSON, valida, llama al modelo y responde con el código HTTP que corresponde.
- **Modelo (`models/`)**: solo consultas preparadas con marcadores con nombre (`:campo`). No lee la petición ni arma respuestas.

## API REST

Todas las respuestas son JSON (`Content-Type: application/json; charset=utf-8`). Los errores internos devuelven un 500 genérico y el detalle va al log del servidor.

| Método y URL | Entrada (JSON) | Salida | Códigos |
| :--- | :--- | :--- | :--- |
| `POST /api/registro.php` | `nombre, email, telefono, password` | usuario y token CSRF | 201, 400, 409 |
| `POST /api/login.php` | `email, password` | usuario y token CSRF | 200, 400, 401, 429 |
| `POST /api/logout.php` | — (cabecera `X-CSRF-Token`) | mensaje | 200, 401, 403 |
| `GET /api/sesion.php` | — | `autenticado` y usuario | 200 |
| `GET /api/perfil.php` | — | datos de la cuenta | 200, 401 |
| `GET /api/unidades.php` | `?id=`, `?categoria=`, `?q=`, `?todas=1` | unidades y categorías | 200, 401, 403, 404 |
| `POST /api/unidades.php` | `id, nombre, categoria, capacidad, carga_maxima, uso, precio, tarifa` | unidad creada | 201, 400, 401, 403, 409 |
| `PUT /api/unidades.php?id=` | mismos campos y `activo` opcional | unidad actualizada | 200, 400, 401, 403, 404 |
| `DELETE /api/unidades.php?id=` | — | mensaje (baja lógica) | 200, 401, 403, 404 |
| `POST /api/presupuesto.php` | `items:[{id,cantidad}]`, `cupon` opcional | desglose y total | 200, 400 |
| `GET /api/pedidos.php` | `?id=`, o `?todos=1&estado=` (personal) | pedidos con sus ítems | 200, 400, 401, 403, 404 |
| `POST /api/pedidos.php` | `direccion, telefono, medio_pago, comentarios, cupon, items` | pedido creado y total | 201, 400, 401, 403 |
| `PUT /api/pedidos.php?id=` | `estado` | pedido actualizado | 200, 400, 401, 403, 404, 409 |
| `DELETE /api/pedidos.php?id=` | — | mensaje (cancelación) | 200, 401, 403, 404, 409 |
| `GET /api/reportes.php` | — | totales y rankings | 200, 401, 403 |

Las escrituras (`POST`, `PUT`, `DELETE`) exigen la cabecera `X-CSRF-Token`, salvo el ingreso y el registro, que todavía no tienen sesión.

## Seguridad aplicada (OWASP)

- **A03 Inyección:** consultas preparadas con marcadores `:campo` y sin concatenar valores. En el navegador, `.textContent` en lugar de `innerHTML`.
- **A02 Criptografía:** contraseñas con BCRYPT (costo 12) en una columna `VARCHAR(255)`, con re-hash automático si el costo queda viejo.
- **A01 Control de acceso:** sin sesión responde 401 y con sesión pero sin el rol correcto, 403. El pedido de otro cliente responde 404 para no confirmar que existe.
- **A07 Autenticación:** `session_regenerate_id(true)` al ingresar, cookie `HttpOnly` y `SameSite`, cierre por 30 minutos de inactividad, token CSRF en las escrituras y bloqueo (429) tras 5 intentos fallidos.
- **A05/A09:** un `set_exception_handler` global evita que un error filtre rutas, usuarios o consultas.
- Las carpetas `config/`, `models/`, `services/`, `sql/` y `tests/` traen un `.htaccess` que impide abrirlas desde el navegador.
