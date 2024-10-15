const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');
const session = require('express-session');

const app = express();
const PORT = process.env.PORT || 1234;

// Middleware
app.use(cors({
    origin: 'http://localhost:5173',
    credentials: true
}));
app.use(bodyParser.json());

// Session configuration
app.use(session({
    secret: 'a_really_long_random_string_with_symbols_!@#$%^&*',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false, httpOnly: true, maxAge: 24 * 60 * 60 * 1000 }
}));

// MySQL Database Connection
const db = mysql.createPool({
    host: 'localhost',
    user: 'newuser',
    password: 'Vedant@123',
    database: 'xangarsfinal',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// Middleware to check if user is authenticated and is a master user
const isMaster = (req, res, next) => {
    if (req.session && req.session.userRole === 'central-admin') {
        next();
    } else {
        res.status(401).json({ error: 'Unauthorized: Master access required' });
    }
};

// API to handle distributor registration
app.post('/api/register', async (req, res) => {
    const { email, password, distributorName, country } = req.body;

    if (!email || !password || !distributorName || !country) {
        return res.status(400).json({ error: 'All fields are required' });
    }

    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        const insertQuery = `
            INSERT INTO Distributor (DistributorName, Email, Password, CountryName)
            VALUES (?, ?, ?, ?)
        `;
        const [result] = await db.query(insertQuery, [distributorName, email, hashedPassword, country]);
        res.status(200).json({ message: 'Distributor registered successfully', distributorId: result.insertId });
    } catch (error) {
        console.error('Error during registration:', error);
        res.status(500).json({ error: 'Error during registration' });
    }
});

// API to handle login for both MasterList (central admin) and Distributor
app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ error: 'Email and password are required' });
    }

    try {
        // First, check if it's a central admin (master)
        const [masterResults] = await db.query('SELECT * FROM Master WHERE EmailID = ?', [email]);

        if (masterResults.length > 0) {
            const master = masterResults[0];
            if (master.Password === password) {
                req.session.userId = master.MasterID;
                req.session.userRole = 'central-admin';
                return res.status(200).json({
                    message: 'Login successful',
                    userRole: 'central-admin',
                    adminId: master.MasterID,
                    email: master.EmailID
                });
            }
        }

        // If not a central admin, check for distributor
        const [distributorResults] = await db.query('SELECT * FROM Distributor WHERE Email = ?', [email]);

        if (distributorResults.length > 0) {
            const distributor = distributorResults[0];
            const isDistributorPasswordMatch = await bcrypt.compare(password, distributor.Password);
            if (isDistributorPasswordMatch) {
                req.session.userId = distributor.DistributorID;
                req.session.userRole = 'distributor';
                req.session.distributorName = distributor.DistributorName;
                req.session.countryName = distributor.CountryName;
                return res.status(200).json({
                    message: 'Login successful',
                    userRole: 'distributor',
                    distributorId: distributor.DistributorID,
                    distributorName: distributor.DistributorName,
                    email: distributor.Email,
                    countryName: distributor.CountryName
                });
            }
        }

        // If no match found for either admin or distributor
        return res.status(400).json({ error: 'Invalid email or password' });
    } catch (error) {
        console.error('Database error during login:', error);
        return res.status(500).json({ error: 'Database error during login' });
    }
});

// API to handle logout
app.post('/api/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            return res.status(500).json({ error: 'Error logging out' });
        }
        res.clearCookie('connect.sid');
        return res.status(200).json({ message: 'Logged out successfully' });
    });
});

// API to get session info
app.get('/api/session', (req, res) => {
    if (req.session.userId) {
        res.json({
            isLoggedIn: true,
            userId: req.session.userId,
            userRole: req.session.userRole,
            distributorName: req.session.distributorName,
            countryName: req.session.countryName
        });
    } else {
        res.json({ isLoggedIn: false });
    }
});
// Get all products (Read)
app.get('/api/products', async (req, res) => {
    try {
        const [results] = await db.query('SELECT * FROM Product');
        res.status(200).json(results);
    } catch (err) {
        console.error('Error fetching products:', err);
        res.status(500).json({ error: 'Database error fetching products' });
    }
});

// Add a new product (Create)
app.post('/api/products', async (req, res) => {
    const { BrandID, CategoryID, SubCategoryID, ItemCode, PartCode, ProductDescription, Warranty, MOQ } = req.body;

    if (!BrandID || !CategoryID || !SubCategoryID || !ItemCode || !ProductDescription || !MOQ) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    try {
        const insertQuery = `
            INSERT INTO Product (BrandID, CategoryID, SubCategoryID, ItemCode, PartCode, ProductDescription, Warranty, MOQ)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `;
        const [result] = await db.query(insertQuery, [BrandID, CategoryID, SubCategoryID, ItemCode, PartCode, ProductDescription, Warranty, MOQ]);
        res.status(201).json({ message: 'Product added successfully', productId: result.insertId });
    } catch (err) {
        console.error('Error adding product:', err);
        res.status(500).json({ error: 'Database error adding product' });
    }
});

// Update a product (Update)
app.put('/api/products/:productId', async (req, res) => {
    const { productId } = req.params;
    const { BrandID, CategoryID, SubCategoryID, ItemCode, PartCode, ProductDescription, Warranty, MOQ } = req.body;

    if (!BrandID || !CategoryID || !SubCategoryID || !ItemCode || !ProductDescription || !MOQ) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    try {
        const updateQuery = `
            UPDATE Product
            SET BrandID = ?, CategoryID = ?, SubCategoryID = ?, ItemCode = ?, PartCode = ?, ProductDescription = ?, Warranty = ?, MOQ = ?
            WHERE ProductID = ?
        `;
        const [result] = await db.query(updateQuery, [BrandID, CategoryID, SubCategoryID, ItemCode, PartCode, ProductDescription, Warranty, MOQ, productId]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Product not found' });
        }
        res.status(200).json({ message: 'Product updated successfully' });
    } catch (err) {
        console.error('Error updating product:', err);
        res.status(500).json({ error: 'Database error updating product' });
    }
});

// Delete a product (Delete)
app.delete('/api/products/:productId', async (req, res) => {
    const { productId } = req.params;

    try {
        const [result] = await db.query('DELETE FROM Product WHERE ProductID = ?', [productId]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Product not found' });
        }
        res.status(200).json({ message: 'Product deleted successfully' });
    } catch (err) {
        console.error('Error deleting product:', err);
        res.status(500).json({ error: 'Database error deleting product' });
    }
});

// Get all brands
app.get('/api/brands', async (req, res) => {
    try {
        const [results] = await db.query('SELECT * FROM Brand');
        res.status(200).json(results);
    } catch (err) {
        console.error('Error fetching brands:', err);
        res.status(500).json({ error: 'Database error fetching brands' });
    }
});

// Add a new brand
app.post('/api/brands', async (req, res) => {
    const { BrandName } = req.body;
    if (!BrandName) {
        return res.status(400).json({ error: 'Brand name is required' });
    }

    try {
        const [result] = await db.query('INSERT INTO Brand (BrandName) VALUES (?)', [BrandName]);
        res.status(201).json({ message: 'Brand added successfully', brandId: result.insertId });
    } catch (err) {
        console.error('Error adding brand:', err);
        res.status(500).json({ error: 'Database error adding brand' });
    }
});

// Get all categories
app.get('/api/categories', async (req, res) => {
    try {
        const [results] = await db.query('SELECT * FROM Category');
        res.status(200).json(results);
    } catch (err) {
        console.error('Error fetching categories:', err);
        res.status(500).json({ error: 'Database error fetching categories' });
    }
});

// Add a new category
app.post('/api/categories', async (req, res) => {
    const { CategoryName } = req.body;
    if (!CategoryName) {
        return res.status(400).json({ error: 'Category name is required' });
    }

    try {
        const [result] = await db.query('INSERT INTO Category (CategoryName) VALUES (?)', [CategoryName]);
        res.status(201).json({ message: 'Category added successfully', categoryId: result.insertId });
    } catch (err) {
        console.error('Error adding category:', err);
        res.status(500).json({ error: 'Database error adding category' });
    }
});

// Get all subcategories
app.get('/api/subcategories', async (req, res) => {
    try {
        const [results] = await db.query('SELECT * FROM SubCategory');
        res.status(200).json(results);
    } catch (err) {
        console.error('Error fetching subcategories:', err);
        res.status(500).json({ error: 'Database error fetching subcategories' });
    }
});

// Add a new subcategory
app.post('/api/subcategories', async (req, res) => {
    const { SubCategoryName, CategoryID } = req.body;
    if (!SubCategoryName || !CategoryID) {
        return res.status(400).json({ error: 'Subcategory name and CategoryID are required' });
    }

    try {
        const [result] = await db.query('INSERT INTO SubCategory (SubCategoryName, CategoryID) VALUES (?, ?)', [SubCategoryName, CategoryID]);
        res.status(201).json({ message: 'Subcategory added successfully', subcategoryId: result.insertId });
    } catch (err) {
        console.error('Error adding subcategory:', err);
        res.status(500).json({ error: 'Database error adding subcategory' });
    }
});

// Get all countries
app.get('/api/countries', async (req, res) => {
    console.log('Received request for countries');
    try {
        const [results] = await db.query('SELECT * FROM Country');
        console.log('Countries fetched successfully:', results);
        res.status(200).json(results);
    } catch (err) {
        console.error('Error fetching countries:', err);
        res.status(500).json({ error: 'Database error fetching countries' });
    }
});

// Get all country-product records
app.get('/api/country-products', async (req, res) => {
    try {
        const [results] = await db.query('SELECT * FROM Country_Product');
        res.status(200).json(results);
    } catch (err) {
        console.error('Error fetching country-product records:', err);
        res.status(500).json({ error: 'Database error fetching records' });
    }
});

// Add a new country-product record
app.post('/api/country-products', async (req, res) => {
    const { CountryID, ProductID, Price } = req.body;

    if (!CountryID || !ProductID || !Price) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    try {
        const [result] = await db.query('INSERT INTO Country_Product (CountryID, ProductID, Price) VALUES (?, ?, ?)', [CountryID, ProductID, Price]);
        res.status(201).json({ message: 'Country-Product record added successfully', countryProductId: result.insertId });
    } catch (err) {
        console.error('Error adding country-product record:', err);
        res.status(500).json({ error: 'Database error adding record' });
    }
});


app.get('/api/distributors/:distributorId', (req, res) => {
    const distributorId = req.params.distributorId;

    const sqlQuery = `
        SELECT DistributorName, CountryName 
        FROM Distributor 
        WHERE DistributorId = ?
    `;

    db.query(sqlQuery, [distributorId], (err, results) => {
        if (err) {
            console.error('Error fetching distributor:', err);
            return res.status(500).json({ error: 'Failed to fetch distributor' });
        }
        if (results.length === 0) {
            return res.status(404).json({ error: 'Distributor not found' });
        }
        res.json(results[0]);
    });
});


app.get('/api/products-by-country', async (req, res) => {
    const countryName = req.query.countryName;
    console.log('Received request for products-by-country');
    console.log('Query:', req.query);

    if (!countryName) {
        return res.status(400).json({ error: 'Country name is required' });
    }

    const sqlQuery = `
        SELECT 
            p.ProductID, 
            p.ItemCode AS ProductCode, 
            p.ProductDescription AS Description, 
            p.MOQ AS MinOrderQty, 
            cp.Price 
        FROM Product p
        JOIN Country_Product cp ON p.ProductID = cp.ProductID
        JOIN Country c ON cp.CountryID = c.CountryID
        WHERE c.CountryName = ?`;

    try {
        const [results] = await db.query(sqlQuery, [countryName]);
        console.log('Query results:', results);
        res.json(results);
    } catch (err) {
        console.error('Error fetching products:', err);
        return res.status(500).json({ error: 'Failed to fetch products', details: err.message });
    }
});


// Update the products by country endpoint


app.get('/api/consolidated-orders', (req, res) => {
    const query = `
        SELECT 
            p.code AS product_code,
            p.description AS product_description,
            o.distributor_name,
            SUM(p.quantity_ordered) AS total_ordered
        FROM 
            products p
        JOIN 
            orders o ON p.order_id = o.id
        GROUP BY 
            p.code, p.description, o.distributor_name
        ORDER BY 
            p.code, o.distributor_name
    `;

    db.query(query, (err, results) => {
        if (err) {
            console.error('Error fetching consolidated orders:', err);
            return res.status(500).json({ error: 'Database error' });
        }

        // Process results into a matrix format
        const consolidatedData = {};
        
        results.forEach(row => {
            if (!consolidatedData[row.product_code]) {
                consolidatedData[row.product_code] = {
                    description: row.product_description,
                    totals: {}
                };
            }
            consolidatedData[row.product_code].totals[row.distributor_name] = row.total_ordered;
        });

        res.status(200).json(consolidatedData);
    });
});

// Start the server
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});