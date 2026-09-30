# Sincronización automática Excel → MySQL

## 1. Instalar dependencias

```bash
cd import
python3 -m venv venv
source venv/bin/activate        # en Windows: venv\Scripts\activate
pip install -r requirements.txt
```

## 2. Configurar

Editá `config_sync.ini`:
- `[db]`: mismas credenciales que usa el sistema web (`stock_user`, la clave que
  configuraste en `config/db.php`).
- `[watcher] carpeta`: la carpeta donde vive el archivo `BASE_MAC_ADDRESS_-_2025-2026.xlsx`.
  Si varias personas lo editan desde distintas PCs, esa carpeta debería ser una
  **carpeta compartida en red** (recurso SMB) a la que el script tenga acceso.

## 3. Correrlo

```bash
python sync_watcher.py
```

Va a hacer una sincronización completa al arrancar, y después se queda
escuchando cambios. Cuando alguien guarda el Excel, en unos segundos
(`debounce_segundos` en el config) los datos aparecen en el sistema web.

### ⚠️ Importante si la carpeta es un recurso de red (SMB/CIFS)

`watchdog` usa notificaciones del sistema operativo (inotify en Linux), que
**no siempre funcionan de forma confiable sobre carpetas de red**. Si notás
que los cambios no se detectan, cambiá a modo "polling" (revisa el archivo
cada X segundos en vez de esperar una notificación): abrí `sync_watcher.py`
y reemplazá:

```python
from watchdog.observers import Observer
```

por:

```python
from watchdog.observers.polling import PollingObserver as Observer
```

Esto es más confiable en red, a costa de no ser instantáneo (revisa cada
~1 segundo por defecto, configurable con `timeout=` al crear el Observer).

## 4. Dejarlo corriendo siempre (systemd, Linux)

Creá `/etc/systemd/system/stock-sync.service`:

```ini
[Unit]
Description=Sincronizador Excel -> MySQL (Stock)
After=network.target mysql.service

[Service]
Type=simple
WorkingDirectory=/ruta/a/stock-app/import
ExecStart=/ruta/a/stock-app/import/venv/bin/python sync_watcher.py
Restart=always
RestartSec=5
User=www-data

[Install]
WantedBy=multi-user.target
```

Activarlo:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now stock-sync
sudo systemctl status stock-sync
```

Los logs quedan en `journalctl -u stock-sync -f`.

### En Windows (si tu servidor Apache corre sobre Windows/XAMPP)

Usá el **Programador de tareas**: crear una tarea que se dispare "al iniciar
el sistema", acción = ejecutar `venv\Scripts\pythonw.exe sync_watcher.py`,
con "repetir si falla" activado. Alternativa más robusta: instalar
[NSSM](https://nssm.cc/) para correrlo como servicio de Windows real.

## 5. Qué sincroniza y qué no

- ✅ **BASE_MAC_ADDRESS_-_2025-2026.xlsx**: todas las hojas de Ingreso, Egreso,
  Devolución y Clientes Migrados se sincronizan automáticamente, fila por fila,
  sin duplicar (cada fila queda marcada por hoja+número de fila).
- ❌ **STOCK_2026.xlsx**: NO se sincroniza automáticamente. Su estructura de
  columnas dinámicas por depósito no es confiable de parsear sin intervención
  manual. Los movimientos de esa planilla hay que cargarlos directamente en el
  sistema web (pantalla de Movimientos), que ya queda como el registro
  confiable de aquí en adelante.

## 6. Revisar el estado de la sincronización

Cada corrida completa deja un registro en la tabla `sync_control`:

```sql
SELECT * FROM sync_control ORDER BY ultima_sync DESC;
```

Ahí ves cuántas filas se procesaron OK y cuántas dieron error (por ejemplo,
una MAC de egreso que no existía en el stock).
