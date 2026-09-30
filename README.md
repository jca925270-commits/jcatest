# Sistema de Stock — Backend en Node.js (sin PHP)

Mismo frontend (HTML + Bootstrap + JavaScript) y misma base de datos MySQL
que ya tenías. Lo único que cambió es el backend: antes eran archivos PHP,
ahora es un servidor Node.js/Express. Tus datos migrados (dispositivos,
movimientos, usuarios, categorías de stock) siguen siendo válidos — no hay
que volver a importar nada.

## 1. Instalar Node.js en tu PC (para probar localmente)

1. Descargá la versión **LTS** de https://nodejs.org
2. Instalala (dejá todas las opciones por defecto)
3. Abrí una consola **nueva** y confirmá:
   ```cmd
   node --version
   npm --version
   ```

## 2. Instalar las dependencias del proyecto

```cmd
cd ruta\a\stock-node
npm install
```

## 3. Configurar la conexión a la base de datos

```cmd
copy .env.example .env
```

Abrí `.env` con VS Code y completá con tus datos reales (los mismos que
usa tu XAMPP: usuario `root`, sin contraseña, base `stock_db`):

```
DB_HOST=127.0.0.1
DB_PORT=3306
DB_NAME=stock_db
DB_USER=root
DB_PASSWORD=
SESSION_SECRET=poné-acá-algo-largo-y-aleatorio-propio
PORT=3000
```

Tu base `stock_db` ya existe (la creaste con `schema.sql` y las migraciones
cuando usábamos PHP) — **no hace falta recrearla ni volver a importar nada**.
Los usuarios que ya tenías también funcionan tal cual, porque el formato de
contraseña (`bcrypt`) es compatible entre PHP y Node.

## 4. Arrancar el servidor

```cmd
npm start
```

Deberías ver:
```
Servidor de Stock corriendo en http://localhost:3000
```

Abrí el navegador en:
```
http://localhost:3000/login.html
```

Y usá las mismas credenciales de siempre. Si por algún motivo no tenés
ningún usuario admin todavía en esta base, corré una vez:

```cmd
node scripts/setup_admin.js
```

## 5. Diferencias a tener en cuenta

- Las URLs de la API ya no terminan en `.php` — pero no tuviste que cambiar
  nada en las páginas, porque `assets/js/api.js` le saca la extensión
  automáticamente antes de armar la petición.
- Ya no hace falta Apache24 ni PHP para nada. Podés dejar de usarlos, o
  convivir con ellos si todavía tenés otras cosas corriendo ahí — no se
  pisan porque Node usa su propio puerto (3000 por defecto).
- El watcher de sincronización (`import/sync_watcher.py`) y los importadores
  (`importar_stock_cantidad.py`, `importar_reparados.py`) siguen funcionando
  exactamente igual — son Python conectándose directo a MySQL, no dependen
  de si el backend web es PHP o Node.

## 6. Subir esto a hosting.com (Node.js hosting)

1. Contratá el plan de **Node.js Hosting** de hosting.com (no el de
   WordPress/PHP tradicional).
2. Subí este proyecto entero (por Git, SSH, o su gestor de archivos —
   hosting.com soporta las tres formas).
3. En el panel de hosting.com vas a poder crear la base de datos MySQL
   (ellos la administran) y te van a dar host/usuario/contraseña — cargá
   esos datos en el `.env` del servidor (no en tu PC).
4. Corré el `schema.sql` y las migraciones en esa base nueva (desde el
   phpMyAdmin/administrador de BD que te den, o por línea de comandos si
   tenés acceso SSH).
5. Indicá que el archivo de arranque es `server.js` y que use `npm start`.
6. hosting.com se encarga de mantener el proceso Node corriendo (reinicio
   automático si se cae, etc.) — no tenés que instalar nada de eso vos.

## 7. Estructura del proyecto

```
stock-node/
├── server.js              Arranque del servidor Express
├── package.json
├── .env.example            Copiar como .env y completar
├── config/db.js            Conexión a MySQL
├── middleware/auth.js      Sesión y permisos por rol
├── routes/                 Un archivo por sección (auth, dispositivos, ...)
├── scripts/setup_admin.js  Crear el primer usuario admin
├── public/                 Frontend: HTML, CSS, JS (igual que antes)
├── sql/                    Esquema y migraciones (sin cambios)
└── import/                 Scripts Python de sincronización (sin cambios)
```
