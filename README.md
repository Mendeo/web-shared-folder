# web-shared-folder

Convenient http server on nodejs. Designed to share some folder on a local network or even on the Internet. It can also be used as a web server to serve static sites.

**A full security audit has not been conducted, so using this server directly to access from the Internet may not be secure. In this case, it is recommended to run this server in a container. See below for an example of running from docker.**

Capabilities
* Pages are automatically displayed in the user language (only two languages are available at the moment).
* User can download the selected files and folders at once as a zip archive.
* User can upload files to the server (if it is enabled on the server).
* User can set file sorting by name, size or date.
* It is possible to work over https protocol with an automatic redirect from http.
* It is possible to enable basic HTTP authentication with a given username and password.
* Can work without javascript enabled on the client side.

![Screenshot with files upload disabled](https://github.com/Mendeo/web-shared-folder/blob/master/img/screenshot_upload_disabled.png)  
*Screenshot with files upload disabled*

![Screenshot with files upload enabled](https://github.com/Mendeo/web-shared-folder/blob/master/img/screenshot_upload_enabled.png)  
*Screenshot with files upload enabled*

## Installation
```bash
npm i -g web-shared-folder
```

## Usage
```bash
web-shared-folder <path to the folder for sharing> <port> [<key> <cert>] [<username> <password>]
```
**If there is the "index.html" file in the specified folder, then the server will start in the static web site mode, not in the folder viewing mode.** The folder contents viewing mode can be forced by setting the environment variable **SERVER_DIRECTORY_MODE=1**. Also, this mode can be forcibly disabled by setting **SERVER_DIRECTORY_MODE=0**.

In order to start the server to work over https, you must specify the path to the private key file (\<key\>) and the path to the certificate file (\<cert\>).
In https mode, it is possible to enable automatic redirection from http to https. To do this, in the **SERVER_AUTO_REDIRECT_HTTP_PORT** environment variable, specify the port number from which the redirection will be performed (usually 80).

If the keys \<username\> and \<password\> are given, then HTTP authentication is enabled with the given login and password.

**All command line options can also be set in the environment variables: SERVER_ROOT, SERVER_PORT, SERVER_KEY, SERVER_CERT, SERVER_USERNAME, SERVER_PASSWORD.** Options specified on the command line have higher precedence.
The password can be set as a md5 hash in the **SERVER_PASSWORD_MD5** environment variable.

In order to allow users not only download files from server, but also upload it to the server, it is necessary to set the environment variable **SERVER_UPLOAD_ENABLE** to 1. **The maximum upload size at one time is about 2 GiB.**
In particular, in this mode, the user can upload a zip archive to the server and then unzip it by clicking on the unzip icon.

You can set the page title in the **SERVER_DIRECTORY_MODE_TITLE** environment variable.

**It is possible to run server in cluster mode.** To do this, set the **SERVER_USE_CLUSTER_MODE** environment variable to 1. In cluster mode, nodejs child processes will be created according to the number of processor cores. This mode allows you to use all the processor resources, but at the same time it increases the consumption of RAM. If **SERVER_SHOULD_RESTART_WORKER=1** is given, the child process will be automatically restarted if it terminates unexpectedly.

By default, the server returns the contents of the web page in a compressed form. If you want to disable this behavior, you can set **SERVER_DISABLE_COMPRESSION=1**

The server uses the [file-icon-vectors](https://www.npmjs.com/package/file-icon-vectors) npm package to display file icons. Three types of icons are available: "classic", "square-o", "vivid" (see the [package page](https://www.npmjs.com/package/file-icon-vectors) for more details). You can set the SERVER_ICONS_TYPE environment variable to one of these values. The default is "square-o".

### Simple example
Suppose the ip address of the computer is 192.168.1.2. It is required to share the folder "/home/user/shared" on the local network from this computer. Execute:

```bash
web-shared-folder /home/user/shared 8080
```
Access to files from the "/home/user/shared" folder can be obtained by typing in the browser address bar:

```
http://192.168.1.2:8080
```

### Complex example
Suppose the computer have a white ip address on the Internet. It is required to share the folder "/home/user/shared" on the Internet from this computer and you don't want to use a reverse proxy to work over https.  
Suppose you already have the ssl certificate for the domain example.com and this domain is bound to the ip of the computer. Path to the certificate file: "/etc/ssl/ssl.crt". Path to the private key file for this certificate: "/etc/ssl/ssl.key".  
To protect against unauthorized access, enable HTTP authentication. Set username "qwerty" and password "123456" (do not use simple passwords for HTTP authentication!). Execute:

```bash
#Path to shared folder
export SERVER_ROOT=/home/user/shared

#Standard https port
export SERVER_PORT=443

#Standart http port
export SERVER_AUTO_REDIRECT_HTTP_PORT=80

#Force enable folder view mode
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

Access to files from the "/home/user/shared" folder can be obtained by typing in the browser address bar:
```
https://example.com
```

## Docker run

To run the server in a docker container, you need to prepare a dockerfile. The simplest example of such a file is shown below:

```dockerfile
FROM node:latest
WORKDIR /app
RUN useradd -M -s /bin/false nodeserv && mkdir /var/www && npm install --global-style web-shared-folder@<current_verson>
USER nodeserv
ENTRYPOINT ["node", "node_modules/web-shared-folder/server.js"]
```
Where \<current_verson\> is current version of web-shared-folder.

Let's start building the image with the server

```bash
docker build -t web-shared-folder .
```

For the simple example above, let's create a container and run the server in it:

```bash
docker run -d -v /home/user/shared:/var/www -e SERVER_ROOT="/var/www" -e SERVER_PORT=8080 --name web-shared-folder -p 80:8080 web-shared-folder
```
