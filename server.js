const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const mysql = require('mysql2');

const app = express();

const PORT = process.env.PORT || 1234;


app.use(cors({
    origin: 'https://xangarsordermanage.netlify.app'
  }));



app.use(bodyParser.json());

// MySQL Database Connection
const db = mysql.createConnection({
    host: 'us-cluster-east-01.k8s.cleardb.net',
    user: 'b2d8a0a0f63451',         // Replace with your MySQL username
    password: '07030726',  // Replace with your MySQL password
    database: 'heroku_cbfcd4de2f6f350'
});

db.connect((err) => {
    if (err) {
        console.error('Error connecting to MySQL:', err);
    } else {
        console.log('Connected to MySQL');
    }
});

// Helper function to check if the order number is unique
const isOrderNoUnique = (orderNo) => {
    return new Promise((resolve, reject) => {
        const query = `SELECT COUNT(*) as count FROM orders WHERE order_no = ?`;
        db.query(query, [orderNo], (err, results) => {
            if (err) return reject(err);
            const count = results[0].count;
            resolve(count === 0); // true if no orders found
        });
    });
};






// API route to handle order submission with validation
app.post('/api/orders', async (req, res) => {
    const { distributorName, orderNo, totalQty, totalValue, products } = req.body;

    // Validation: Ensure all fields are filled and products are not empty
    if (!distributorName || !orderNo || !totalQty || !totalValue || !products || products.length === 0) {
        return res.status(400).json({ error: 'All fields must be filled, and products cannot be empty.' });
    }

    try {
        // Check if order number is unique
        const isUnique = await isOrderNoUnique(orderNo);
        if (!isUnique) {
            return res.status(400).json({ error: 'Order number already exists. It must be unique.' });
        }

        // Insert order into 'orders' table
        const insertOrderQuery = `INSERT INTO orders (distributor_name, order_no, total_qty, total_value) VALUES (?, ?, ?, ?)`;
        db.query(insertOrderQuery, [distributorName, orderNo, totalQty, totalValue], (err, result) => {
            if (err) {
                console.error('Error inserting order:', err);
                return res.status(500).json({ error: 'Database error when inserting order.' });
            }

            const orderId = result.insertId;

            // Insert products into 'products' table
            const insertProductQuery = `INSERT INTO products (order_id, code, description, min_order_qty, price, quantity_ordered, total_value) VALUES ?`;
            const productValues = products.map(product => [
                orderId,
                product.code,
                product.description,
                product.minOrderQty,
                product.price,
                product.quantityOrdered,
                product.totalValue
            ]);

            db.query(insertProductQuery, [productValues], (err) => {
                if (err) {
                    console.error('Error inserting products:', err);
                    return res.status(500).json({ error: 'Database error when inserting products.' });
                }

                res.status(200).json({ message: 'Order and products saved successfully' });
            });
        });

    } catch (err) {
        console.error('Error processing order:', err);
        res.status(500).json({ error: 'Server error during order processing' });
    }
});

// API route to get consolidated orders
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

app.post('/api/validate', (req, res) => {
    const productCodes = req.body.productCodes;

    // Check if all product codes exist in the masterlist
    const query = 'SELECT product_code FROM masterlist WHERE product_code IN (?)';
    db.query(query, [productCodes], (err, results) => {
        if (err) return res.status(500).json({ message: 'Database error' });

        const validCodes = results.map(row => row.product_code);
        const invalidCodes = productCodes.filter(code => !validCodes.includes(code));

        if (invalidCodes.length > 0) {
            return res.status(400).json({ message: 'Invalid product codes', invalidCodes });
        }

        res.status(200).json({ message: 'All product codes are valid' });
    });
});



// Start the server
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});