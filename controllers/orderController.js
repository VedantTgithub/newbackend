const db = require('../db/connection');

exports.createOrder = (req, res) => {
    const { distributorName, orderNo, totalQty, totalValue, products } = req.body;

    // Insert the distributor
    db.query('INSERT INTO distributors (name) VALUES (?)', [distributorName], (err, result) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }

        const distributorId = result.insertId;

        // Insert the order
        db.query('INSERT INTO orders (distributor_id, order_number, total_quantity, total_value) VALUES (?, ?, ?, ?)', 
        [distributorId, orderNo, totalQty, totalValue], 
        (err, result) => {
            if (err) {
                return res.status(500).json({ error: err.message });
            }

            const orderId = result.insertId;

            // Insert the products
            const productValues = products.map(product => [
                orderId,
                product.code,
                product.description,
                product.minOrderQty,
                product.price,
                product.quantityOrdered,
                product.totalValue
            ]);

            db.query('INSERT INTO products (order_id, product_code, description, min_order_qty, price, quantity_ordered, total_value) VALUES ?',
            [productValues], 
            (err) => {
                if (err) {
                    return res.status(500).json({ error: err.message });
                }
                res.status(201).json({ message: 'Order created successfully!' });
            });
        });
    });
};
