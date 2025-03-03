# v 4.0.0
Removed http authentication. Instead, added the ability to create different users with access only to a specified user folder. Updated README.md and ```wsf --help```  
**Breaking changes:**
* **In the environment variables, the prefix is ​​now WSF instead of SERVER**
* **Username and password can no longer be specified in command line arguments**

# v 3.3.*
Added the ability to specify which network interfaces the server will listen to.

# v 3.2.*
* Symbolic links to directories are no longer allowed.
* Added the ability to set prohibited paths in the environment variable SERVER_FORBIDDEN_PATHS (relative to the root and separated by the symbol ":").

# v 3.1.0
* Prevent the display of symbolic links pointing above the server root.

# v 3.0.0
* Improved security.
* Added the ability to rename files and folders.
* Added the ability to copy and move files and folders.
* The labels on the buttons have become clearer.
* Added a normal 404 page even when displaying a static user site.
* Improved HTML semantics, removed extra lines.
* Improved accessibility.
* Added tooltips.
* The server no longer produces JS and CSS code responsible for writing to the server if the writing mode is disabled.
* Correcting errors in downloading files and folders with certain characters in names, etc.
* Now downloading a zip archive occurs via a GET request, which eliminates download errors in some browsers, and also user can share the link to download zip-archive with several files.
* Fixed errors in the zip archive structure when downloading multiple files.
* Added alias "wsf" to start the server.
* Made the maximum displayed length of 70 characters of a file or folder name.
* Other minor bug fixes and code refactorings.