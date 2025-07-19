# DOCKERFILE - Instructions for building our custom API container
# Think of this as a recipe for creating a standardized environment for our app

# BASE IMAGE - Start with a pre-built Node.js environment
# "node:18-alpine" = Node.js version 18 on Alpine Linux (small, secure Linux distro)
# This gives us Node.js, npm, and basic Linux tools in a lightweight package
FROM node:18-alpine

# WORKING DIRECTORY - Set where commands run inside the container
# Like doing "cd /app" - all subsequent commands happen in this folder
WORKDIR /app

# COPY PACKAGE FILES FIRST - Copy package.json (and package-lock.json if it exists)
# We copy these separately BEFORE copying source code for Docker layer caching
# If package.json hasn't changed, Docker reuses the npm install step = faster builds
COPY package*.json ./

# INSTALL DEPENDENCIES - Download and install npm packages
# --only=production = don't install devDependencies (saves space and time)
# This creates node_modules/ inside the container
RUN npm install --only=production

# COPY SOURCE CODE - Now copy our JavaScript files
# Done after npm install so source code changes don't trigger npm install again
COPY src/ ./src/

# CREATE MEDIA DIRECTORIES - Make folders that our app expects
# These will be mounted/replaced by volumes in docker-compose.yml
RUN mkdir -p /app/downloads /app/movies

# EXPOSE PORT - Document which port the app uses
# This doesn't actually publish the port - docker-compose.yml does that
# It's mainly documentation and used by some Docker tools
EXPOSE 3000

# START COMMAND - What runs when the container starts
# CMD runs when "docker run" happens (vs RUN which runs during build)
# ["node", "src/index.js"] = run "node src/index.js" to start our Express server
CMD ["node", "src/index.js"] 