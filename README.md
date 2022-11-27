# web-shared-fodler

Удобный http сервер на nodejs. Предназначен для того, чтобы расшарить папку по локальной сети или даже в интернете. Может также использоваться как веб-сервер для отдачи статических сайтов.

Возможности
* Страницы автоматически отображаются на нужном языке (пока доступно только два языка).
* Возможность скачать всю папку как zip-архив.
* Сортировка по имени, размеру и дате.
* Возможна работа по протоколу https с автоматическим редиректом с http.
* Возможность включить базовую HTTP аутентификацию с заданными именем пользователя и паролем.

## Установка
```
npm i -g web-shared-folder
```


## Запуск

```
web-shared-folder <Путь к папке, которую нужно расшарить> <port> [<key> <cert>] [<username> <password>]
```
**Если в заданной пользователем папке будет находится файл "index.html", то сервер запустится в режиме отдачи веб страниц, а не в режиме отображения папки.** Режим отображения содержмимого папки можно включить принудительно, задав переменную окружения SERVER_DIRECTORY_MODE=1. Также этот режим можно принудительно отключить, задав SERVER_DIRECTORY_MODE=0.

Для работы сервера по протоколу https необходимо задать путь файлу закрытого ключа, и путь к файлу сертификата. Это ключи \<key\> и \<cert\> соответственно.
При работе сервера в этом режиме, можно включить автоматическое перенаправление с http на https. Для этого нужно в переменной окружения SERVER_AUTO_REDIRECT_HTTP_PORT указать номер порта, с которого будет осуществляться перенаправление (обычно 80).

Задание параметров \<username\> и \<password\> - включает базовую HTTP аутентификацию с заданными именем пользователя и паролем.

**Все параметры коммандной строки можно задавать также в переменных окружения: SERVER_ROOT, SERVER_PORT, SERVER_KEY, SERVER_CERT, SERVER_USERNAME, SERVER_PASSWORD.** Параметры, заданные в коммандной строке имеют более высокий приоритет.

Также в переменной окружения SERVER_DIRECTORY_MODE_TITLE можно задать заголовок страницы.

**Сервер можно запустить в режиме кластера** путём задания переменной окружения SERVER_USE_CLUSTER_MODE=1. В этом будут созданы дочерние процессы nodejs по числу ядер процессора. Этот режим позволяет задействовать в работе сервера все ресурсы процессора, но при этом кратно возрастает потребление опертивной памяти. Для режима кластера имеется возможность задать переменную окружения SERVER_SHOULD_RESTART_WORKER=1. Это приведёт к автоматическому перезапуску дочернего процесса в случае его непредвиденного завершения.

### Простой пример
Пусть ip адрес компьютера 192.168.1.2. Требуется расшарить в локальной сети с этого компьютера папку "/home/user/shared".
```
web-shared-folder /home/user/shared 8080
```
Доступ к файлам из папки "/home/user/shared" можно получить набрав в адресной строке браузера:
```
http://192.168.1.2:8080
```

### Сложный пример
Пусть компьютер имеет белый ip адрес в интернете. Требуется расшарить в интернете с этого компьютера папку "/home/user/shared". Нужно сделать это по защищённому протоколу, поэтому сначала требуется получить ssl сертифкат.  
Пусть уже имеется ssl-сертификат на домен example.com и этот домен привязан к ip компьютера. Путь к файлу сертиката: "/etc/ssl/ssl.crt", путь к файлу приватного ключа для этого сертификата: "/etc/ssl/ssl.key".  
Для защиты от постороннего доступа зададим имя пользователя "qwerty" и пароль "123456" (не используйте простые пароли для HTTP аутентификации!).
```
#Path to shared folder
export SERVER_ROOT=/home/user/shared

#Standard https port
export SERVER_PORT=443

#Standart http port
export SERVER_AUTO_REDIRECT_HTTP_PORT=80

#Force enable folder share mode
export SERVER_DIRECTORY_MODE=1

#Path to ssl certificate file
export SERVER_CERT=/etc/ssl/ssl.crt

#Path to ssl key file
export SERVER_KEY=/etc/ssl/ssl.key

#User name for HTTP authentication
export SERVER_USERNAME=qwerty

#Password for HTTP authentication
export SERVER_PASSWORD=123456

#Page title
export SERVER_DIRECTORY_MODE_TITLE="Secret folder"

#Enable multi process start
export SERVER_USE_CLUSTER_MODE=1

#Restart worker process if destroyed
export SERVER_SHOULD_RESTART_WORKER=1

#Start server from root with preserve environment key
sudo -E web-shared-folder
```
Доступ к файлам из папки "/home/user/shared" можно получить набрав в адресной строке браузера:
```
https://example.com
```