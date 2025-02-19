# web-shared-folder

## Запуск
```bash
wsf
```
или
```bash
web-shared-folder
```
Доступные параметры:
* --upload or -u - включают режим, позволяющий записывать на сервер.
* [--upload or -u] </path/to/folder/for/sharing> <port> [</path/to/key> </path/to/cert>]


Переменная окружения          |Описание
:-----------------------------|:-
WSF_ALLOWED_INTERFACES        |Список интерфейсов, на которых будет доступен сервер. По умолчанию сервер будет доступен на всех доступных сетевых интерфейсах, однако это не желательно, если требуется, например, ограничить доступ из внешней сети. В этой переменной задаётся список ip адресов (через запятую), на которых будет работать сервер.Например, чтобы был доступ только для localhost можно задать WSF_ALLOWED_INTERFACES=127.0.0.1
WSF_AUTO_REDIRECT_HTTP_PORT   |Когда сервер работает в защищённом режиме (по протоколу HTTPS), то есть возможность включить автоматическую переадресацию клиентов, пытабхихся подключиться по протоколу HTTP. Например, пусть сервер работает на стандартном для HTTPS порту 443. Требуется сделать автоматическое перенаправление клиентов, подключающихся по HTTP (стандартный порт 80), для этого задаётся WSF_AUTO_REDIRECT_HTTP_PORT=80
WSF_CERT                      |Путь к файлу ssl сертификата (fullchain.pem)
WSF_DIRECTORY_MODE            |Если в корневой папке есть файл index.html, то сервер по умолчанию запускается в режиме отображения веб страницы, связанной с index.html, а не в режиме отображения содержимого директории. Для принидительного переключения на режим отображения содержимого директории следует задать WSF_DIRECTORY_MODE=1
WSF_DIRECTORY_MODE_TITLE      |Задаёт заголовок страниц, который отображается на вкладке в браузере. По умолчанию отображается "Удалённый менеджер файлов"
WSF_DISABLE_COMPRESSION       |Позволяет принудительно отключить сжатие файлов при передаче по сети. Требуется для целей отладки и на отображение в браузере не влияет.
WSF_FORBIDDEN_PATHS           |Список путей, относительно в корневой директории, которые не будут отображаться у клиентов.
WSF_ICONS_TYPE                |The server uses the [file-icon-vectors](https://www.npmjs.com/package/file-icon-vectors) npm package to display file icons. Three types of icons are available: "classic", "square-o", "vivid" (see the [package page](https://www.npmjs.com/package/file-icon-vectors) for more details). You can set the **SERVER_ICONS_TYPE** environment variable to one of these values. The default is "square-o". Задать вид иконок для отображения значков файлов и папок. Три возможных варианта: "classic", "square-o" и "vivid". По умолчанию используется "square-o". Подробней [package page](https://www.npmjs.com/package/file-icon-vectors)
WSF_KEY                       |
WSF_PORT                      |
WSF_ROOT                      |
WSF_SESSION_TIMEOUT           |
WSF_SHOULD_RESTART_WORKER     |
WSF_SHOW_SYSTEM_FILES_REQUESTS|
WSF_UPLOAD_ENABLE             |
WSF_USERS                     |
WSF_USE_CLUSTER_MODE          |

