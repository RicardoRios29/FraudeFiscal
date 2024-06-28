const express = require('express');
const app = express();
const { MongoClient, ObjectId } = require('mongodb');
const PORT = 3000;

// Define la URI de la base de datos
const uri = "mongodb+srv://guardme:Guardme.123@guardme.xizczhv.mongodb.net/";

// Crea una instancia de MongoClient con la URI
const client = new MongoClient(uri);

// Middleware para parsear JSON y urlencoded bodies
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

async function main() {
    try {
        // Conectar al clúster de MongoDB
        await client.connect();
        console.log("Conexión establecida con MongoDB");

        // Iniciar la aplicación de Express y escuchar en el puerto definido
        app.listen(PORT, () => {
            console.log(`Servidor corriendo en http://localhost:${PORT}/`);
        });
    } catch (e) {
        console.error("Error al conectar a MongoDB: ", e);
    }
}

//! Funciones de Base de datos
// insertar empresa
async function insertEmpresa(client, empresaData) {
    const result = await client.db("Facturacion").collection("Empresas").insertOne(empresaData);
    console.log(`Nueva empresa creada con el ID: ${result.insertedId}`);
}

// insertar factura
async function insertFactura(client, facturaData) {
    const result = await client.db("Facturacion").collection("Facturas").insertOne(facturaData);
    console.log(`Nueva factura creada con el ID: ${result.insertedId}`);

    // Llama a la función para detectar facturación falsa después de insertar la factura
    await detectarFacturacionFalsa(client, facturaData, result.insertedId);
}

// Eliminar factura
async function eliminarFactura(client, facturaId) {
    await client.db("Facturacion").collection("Facturas").deleteOne({ _id: new ObjectId(facturaId) });
    console.log(`Factura con ID: ${facturaId} eliminada`);
}

//! Rutas
// página principal
app.get('/', (req, res) => {
    res.send(`
        <h1>Bienvenido al Simulador de Fraudes</h1>
        <a href="/agregar-empresa">Agregar Empresa</a><br>
        <a href="/seleccionar-empresa">Seleccionar Empresa</a>
    `);
});

// Ruta agregar empresa 
app.get('/agregar-empresa', (req, res) => {
    res.send(`
        <h2>Agregar Nueva Empresa</h2>
        <form action="/agregar-empresa" method="POST">
            <label for="nombre">Nombre:</label>
            <input type="text" id="nombre" name="nombre" required><br>
            <label for="empleados">Empleados:</label>
            <input type="text" id="empleados" name="empleados" required><br>
            <label for="proveedores">Proveedores:</label>
            <input type="text" id="proveedores" name="proveedores" required><br>
            <button type="submit">Agregar Empresa</button>
        </form>
    `);
});

// Ruta para seleccionar una empresa y agregar factura (formulario)
app.get('/seleccionar-empresa', async (req, res) => {
    try {
        // Obtener todas las empresas desde MongoDB
        const empresas = await client.db("Facturacion").collection("Empresas").find().toArray();

        // Crear opciones para el campo de selección
        const options = empresas.map(empresa => `<option value="${empresa['Nombre emp.']}">${empresa['Nombre emp.']}</option>`).join('');

        // Renderizar el formulario con el campo de selección
        res.send(`
            <h2>Seleccionar Empresa y Agregar Factura</h2>
            <form action="/seleccionar-empresa" method="POST">
                <label for="empresa">Empresa:</label>
                <select id="empresa" name="empresa" required>
                    ${options}
                </select><br>
                <label for="monto">Monto:</label>
                <input type="number" id="monto" name="monto" required><br>
                <label for="fecha">Fecha:</label>
                <input type="date" id="fecha" name="fecha" required><br>
                <label for="concepto">Concepto:</label>
                <input type="text" id="concepto" name="concepto" required><br>
                <label for="proveedor">Proveedor:</label>
                <input type="text" id="proveedor" name="proveedor" required><br>
                <button type="submit">Agregar Factura</button>
            </form>
        `);
    } catch (error) {
        console.error("Error al obtener empresas: ", error);
        res.status(500).send("Error al cargar empresas");
    }
});

//! CRUD 
// POST nueva empresa
app.post('/agregar-empresa', async (req, res) => {
    const { nombre, empleados, proveedores } = req.body;

    // Crear el objeto de empresa a insertar
    const nuevaEmpresa = {
        "Nombre emp.": nombre,
        "Empleados": empleados.split(",").map(nombre => ({ "Nombre": nombre.trim(), "Salario": "Sueldo de Patron" })),
        "Proveedores": proveedores.split(",").map(proveedor => proveedor.trim())
    };

    try {
        await insertEmpresa(client, nuevaEmpresa);
        res.redirect('/');
    } catch (error) {
        console.error("Error al agregar empresa: ", error);
        res.status(500).send("Error al agregar empresa");
    }
});


// POST nueva factura
app.post('/seleccionar-empresa', async (req, res) => {
    const { empresa, monto, fecha, concepto, proveedor } = req.body;

    // Crear el objeto de factura a insertar
    const nuevaFactura = {
        "Empresa": empresa,
        "Monto": parseFloat(monto),
        "Fecha": new Date(fecha),
        "Concepto": concepto,
        "Proveedores": proveedor.split(",").map(proveedor => proveedor.trim())
    };

    try {
        await insertFactura(client, nuevaFactura);
        res.redirect('/');
    } catch (error) {
        console.error("Error al agregar factura: ", error);
        res.status(500).send("Error al agregar factura");
    }
});

// Iniciar la conexión a MongoDB y el servidor
main().catch(console.error);

//! Funciones de detección de fraudes
// Función para detectar montos inusuales
async function detectarMontosInusuales(client, factura) {
    if (factura.Monto > 100000) {
        console.log(`Alerta: Factura con monto inusual detectada - ID: ${factura._id}, Monto: ${factura.Monto}`);
        console.log("Detalles de la Factura:", factura);
        return true;
    }
    return false;
}

// Función para detectar alta frecuencia de facturación
async function detectarAltaFrecuencia(client, factura) {
    try {
        const periodo = 30; // 30 días
        const fechaInicio = new Date(factura.Fecha);
        fechaInicio.setDate(fechaInicio.getDate() - periodo);

        const count = await client.db("Facturacion").collection("Facturas").countDocuments({
            "Empresa": factura.Empresa,
            "Fecha": { $gte: fechaInicio, $lte: new Date(factura.Fecha) }
        });

        if (count > 2) {
            console.log(`Alerta: Alta frecuencia de facturación detectada para la empresa ${factura.Empresa}`);
            console.log(`Número de facturas en los últimos ${periodo} días: ${count}`);
            return true;
        }
        return false;
    } catch (error) {
        console.error("Error al detectar alta frecuencia de facturación: ", error);
        return false;
    }
}



//* Función para detectar facturación falsa
async function detectarFacturacionFalsa(client, factura, facturaId) {
    try {
        const montoInusual = await detectarMontosInusuales(client, factura);
        const altaFrecuencia = await detectarAltaFrecuencia(client, factura);

        if (montoInusual || altaFrecuencia) {
            console.log(`Alerta: Factura falsa detectada - ID: ${facturaId}`);
            await eliminarFactura(client, facturaId);
            return true;
        }
        return false;
    } catch (error) {
        console.error("Error al detectar facturación falsa: ", error);
        return false;
    }
}
