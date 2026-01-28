# ShopMATE

ShopMATE is a modern E-commerce application skeleton built with the MERN stack (MongoDB, Express.js, React, Node.js). It provides a solid foundation for rebuilding a scalable online store with a focus on clean architecture and future AI integration.

## Features

- **Modular Architecture**: Separate client and server structures for better maintainability.
- **Modern Frontend**: Built with React (Vite) and Tailwind CSS for a responsive and sleek UI.
- **Robust Backend**: Node.js and Express.js REST API with native MongoDB driver for flexibility.
- **State Management**: React Context API for managing global application state.
- **AI-Ready**: Structured to easily integrate AI features like recommendations or chatbots.

## Tech Stack

### Client
- **Framework**: React (Vite)
- **Styling**: Tailwind CSS
- **Routing**: React Router DOM (v6)
- **Icons**: Lucide React
- **HTTP Client**: Axios

### Server
- **Runtime**: Node.js
- **Framework**: Express.js
- **Database**: MongoDB (Native Driver)
- **Utilities**: Dotenv, CORS, Nodemon

## Prerequisites

- [Node.js](https://nodejs.org/) (v16 or higher)
- [MongoDB](https://www.mongodb.com/) (Local instance or Atlas URI)

## Setup Instructions

### 1. Server Setup

Navigate to the `server` directory and install dependencies:

```bash
cd server
npm install
```

**Environment Configuration:**

Create a `.env` file in the `server` directory with the following variables:

```env
PORT=3001
MONGO_URI=<MONGODB ATLAS CONNECTION URL>
```

**Database Seeding (Optional):**

To populate the database with initial mock data:

```bash
npm run seed
```

**Start the Server:**

```bash
npm run dev
```

The server will run on `http://localhost:3001`.

### 2. Client Setup

Open a new terminal, navigate to the `client` directory, and install dependencies:

```bash
cd ../client
npm install
```

**Start the Client:**

```bash
npm run dev
```

The application will be available at `http://localhost:5173`.

## Project Structure

```
ShopMATE/
├── client/          # frontend application (Vite + React)
│   ├── src/         # source code
│   └── public/      # static assets
└── server/          # backend application (Node + Express)
    ├── controllers/ # route controllers
    ├── routes/      # api routes
    └── db/          # database connection
```

## License

This project is licensed under the ISC License.

