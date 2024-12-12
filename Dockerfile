
FROM node:21.5
#docker build -t cc-meeting-transfer-widget .
#docker run -p 5000:5000 -i -t cc-meeting-transfer-widget

WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

CMD [ "npm", "start" ]